import { Sphere, getCoinIdBySymbol } from "@unicitylabs/sphere-sdk";
import { createNodeProviders } from "@unicitylabs/sphere-sdk/impl/nodejs";
import { createWalletApiProviders } from "@unicitylabs/sphere-sdk/impl/shared/wallet-api";
import { AGENT_A, NETWORK, ORACLE_API_KEY, SERVICE } from "./shared.js";
import { enrich } from "./service.js";
import type { ServiceRequest } from "./shared.js";
import * as fs from "fs";

const TAG = "[agent-a enricher]";
function log(...args: unknown[]) { console.log(TAG, new Date().toISOString(), ...args); }

async function main() {
  log("booting agent-a (service provider)...");

  // Base providers only — no wallet-api dependency
  const providers = createNodeProviders({
    network: NETWORK,
    dataDir: "./data/agent-a/data",
    tokensDir: "./data/agent-a/tokens",
    oracle: { apiKey: ORACLE_API_KEY },
    market: true,
  });

  let sphere: Sphere;
  try {
    const result = await Sphere.init({
      ...providers,
      autoGenerate: true,
      nametag: "enricher-v2",
      network: "testnet2",
    });
    sphere = result.sphere;
    if (result.created && result.generatedMnemonic) {
      log("NEW WALLET — save this mnemonic:", result.generatedMnemonic);
    }
  } catch (err: any) {
    if (err.code === "VALIDATION_ERROR") {
      log("nametag already taken, loading existing wallet...");
      const result = await Sphere.init({
        ...providers,
        autoGenerate: true,
        network: "testnet2",
      });
      sphere = result.sphere;
    } else { throw err; }
  }

  log("wallet ready");
  log("  address:", sphere.identity?.directAddress);
  log("  nametag:", sphere.identity?.nametag);
  log("  pubkey:", sphere.identity?.chainPubkey);

  // Self-mint test tokens
  log("self-minting...");
  try {
    const coinId = getCoinIdBySymbol(SERVICE.coin);
    if (coinId) {
      const result = await sphere.payments.mintFungibleToken(coinId, 1000n);
      log("mint:", result.success ? "ok" : result.error);
    }
  } catch (err) { log("mint skipped:", err); }

  // Publish service intent to market
  log("publishing intent...");
  try {
    const market = sphere.market;
    if (market) {
      const result = await market.postIntent({
        description: JSON.stringify({
          service: "data-enricher", capabilities: ["lookup", "score", "verify"],
          price: SERVICE.price, coin: SERVICE.coin,
          address: sphere.identity?.directAddress,
          pubkey: sphere.identity?.chainPubkey,
        }),
        intentType: "service", category: "data-enrichment",
        contactHandle: AGENT_A.nametag,
      });
      log("intent published:", result.intentId);

      // Write discovery file for Agent B
      fs.writeFileSync("./data/provider-discovery.json", JSON.stringify({
        address: sphere.identity?.directAddress,
        pubkey: sphere.identity?.chainPubkey,
        nametag: sphere.identity?.nametag,
        intentId: result.intentId,
        timestamp: new Date().toISOString(),
      }, null, 2));
      log("discovery file written");
    }
  } catch (err) { log("intent publish failed:", err); }

  // Listen for incoming transfers via receive()
  log("listening for incoming transfers...");
  const { transfers } = await sphere.payments.receive(undefined, async (transfer) => {
    const firstToken = transfer.tokens?.[0];
    log("INCOMING:", firstToken?.amount, firstToken?.symbol, "from", transfer.senderNametag || transfer.senderPubkey);
    try {
      const request: ServiceRequest = JSON.parse(transfer.memo || "{}");
      if (request.task) {
        log("service request:", request.task);
        const response = enrich(request);
        log("enrichment done:", response.task);
        if (transfer.senderNametag) {
          await sphere.payments.send({
            recipient: `@${transfer.senderNametag}`, amount: "0",
            coinId: SERVICE.coin, memo: JSON.stringify(response),
          });
          log("result delivered to @" + transfer.senderNametag);
        }
      }
    } catch {}
  });
  if (transfers?.length) log("processed", transfers.length, "pending on boot");

  log("agent-a is live. waiting for requests...");
  process.on("SIGINT", () => { sphere.destroy(); process.exit(0); });
}

main().catch((err) => { console.error(TAG, "fatal:", err); process.exit(1); });
