import { Sphere, getCoinIdBySymbol } from "@unicitylabs/sphere-sdk";
import { createNodeProviders } from "@unicitylabs/sphere-sdk/impl/nodejs";
import { createWalletApiProviders } from "@unicitylabs/sphere-sdk/impl/shared/wallet-api";
import { AGENT_B, NETWORK, ORACLE_API_KEY, SERVICE } from "./shared.js";
import type { ServiceResponse } from "./shared.js";
import * as fs from "fs";

const TAG = "[agent-b scout]";
function log(...args: unknown[]) { console.log(TAG, new Date().toISOString(), ...args); }

async function main() {
  log("booting agent-b (service consumer)...");

  // Base providers only — no wallet-api dependency
  const providers = createNodeProviders({
    network: NETWORK,
    dataDir: "./data/agent-b/data",
    tokensDir: "./data/agent-b/tokens",
    oracle: { apiKey: ORACLE_API_KEY },
    market: true,
  });

  let sphere: Sphere;
  try {
    const result = await Sphere.init({
      ...providers,
      autoGenerate: true,
      nametag: "cli-wyirmepy",
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
  log("  pubkey:", sphere.identity?.chainPubkey);

  // Self-mint
  log("self-minting...");
  try {
    const coinId = getCoinIdBySymbol(SERVICE.coin);
    if (coinId) {
      const result = await sphere.payments.mintFungibleToken(coinId, 10000000n);
      log("mint:", result.success ? "ok" : result.error);
    }
  } catch (err) { log("mint skipped:", err); }

  // Discover provider
  let provider: string | null = null;
  try {
    const discovery = JSON.parse(fs.readFileSync("./data/provider-discovery.json", "utf-8"));
    if (discovery.address) {
      provider = discovery.address;
      log("discovered provider:", provider);
    }
  } catch { log("no discovery file"); }

  if (!provider) {
    log("no provider found, exiting");
    sphere.destroy();
    return;
  }

  // Send payment + task
  log("sending payment + task to", provider);
  try {
    const result = await sphere.payments.send({
      recipient: provider,
      amount: SERVICE.price,
      coinId: SERVICE.coin,
      memo: JSON.stringify({ task: "lookup", data: { query: "Unicity testnet status" } }),
    });
    log("PAYMENT SENT:", result.status);
    log("deliveryPending:", result.deliveryPending);
  } catch (err: any) {
    log("payment failed:", err.code || err.message);
  }

  // Listen for result
  log("listening for enrichment result...");
  const timeout = setTimeout(() => { log("timeout waiting for result"); }, 60_000);

  sphere.payments.receive(undefined, async (transfer) => {
    try {
      const response: ServiceResponse = JSON.parse(transfer.memo || "{}");
      if (response.result && response.task) {
        log("RESULT:", JSON.stringify(response.result, null, 2));
        clearTimeout(timeout);
      }
    } catch {}
  }).catch(() => {});

  log("agent-b waiting for result...");
  process.on("SIGINT", () => { sphere.destroy(); process.exit(0); });
}

main().catch((err) => { console.error(TAG, "fatal:", err); process.exit(1); });
