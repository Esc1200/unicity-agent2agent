/**
 * Agent A — The Service Provider ("enricher")
 *
 * Autonomous agent that:
 * 1. Boots a Sphere wallet on testnet2
 * 2. Registers the "enricher" nametag
 * 3. Publishes a service intent to the market
 * 4. Listens for incoming DMs with service requests
 * 5. When a request + payment arrives, fulfils it and DMs the result back
 *
 * No human in the loop after startup.
 */

import { Sphere, getCoinIdBySymbol } from "@unicitylabs/sphere-sdk";
import { createNodeProviders } from "@unicitylabs/sphere-sdk/impl/nodejs";
import { createWalletApiProviders } from "@unicitylabs/sphere-sdk/impl/shared/wallet-api";
import { AGENT_A, NETWORK, ORACLE_API_KEY, SERVICE } from "./shared.js";
import { enrich } from "./service.js";
import type { ServiceRequest } from "./shared.js";

const TAG = "[agent-a enricher]";

function log(...args: unknown[]) {
  console.log(TAG, new Date().toISOString(), ...args);
}

async function bootWallet() {
  const base = createNodeProviders({
    network: NETWORK,
    dataDir: "./data/agent-a/data",
    tokensDir: "./data/agent-a/tokens",
    oracle: { apiKey: ORACLE_API_KEY },
  });

  const providers = createWalletApiProviders(base, {
    baseUrl: "https://wallet-api.unicity.network",
    network: "testnet2",
    deviceId: "agent-a-enricher",
  });

  // Skip nametag if already registered — it's first-come-first-served on Nostr
  let sphere: Sphere;
  try {
    const result = await Sphere.init({
      ...providers,
      autoGenerate: true,
      nametag: "srv-7ph7f875",
      network: "testnet2",
      market: true,
    });
    sphere = result.sphere;
    if (result.created && result.generatedMnemonic) {
      log("NEW WALLET — save this mnemonic:", result.generatedMnemonic);
    }
  } catch (err: any) {
    if (err.code === "VALIDATION_ERROR" && err.message?.includes("Unicity ID") || err.message?.includes("nametag")) {
      log("nametag already taken, loading existing wallet...");
      const result = await Sphere.init({
        ...providers,
        autoGenerate: true,
        network: "testnet2",
        market: true,
      });
      sphere = result.sphere;
    } else {
      throw err;
    }
  }

  log("wallet ready");
  log("  address:", sphere.identity?.directAddress);
  log("  nametag:", sphere.identity?.nametag);
  log("  pubkey:", sphere.identity?.chainPubkey);

  return sphere;
}

async function publishServiceIntent(sphere: Sphere) {
  log("publishing service intent to market...");

  try {
    const market = sphere.market;
    if (!market) {
      log("market module not available");
      return;
    }

    const result = await market.postIntent({
      description: JSON.stringify({
        service: "data-enricher",
        capabilities: ["lookup", "score", "verify"],
        price: SERVICE.price,
        coin: SERVICE.coin,
        description:
          "Autonomous data enrichment agent. Send a task via DM with payment. I enrich and return.",
        address: sphere.identity?.directAddress,
        pubkey: sphere.identity?.chainPubkey,
      }),
      intentType: "service",
      category: "data-enrichment",
      contactHandle: AGENT_A.nametag,
    });

    log("intent published:", result.intentId);

    // Write provider address to shared file for local discovery
    const fs = await import("fs");
    const discovery = {
      address: sphere.identity?.directAddress,
      pubkey: sphere.identity?.chainPubkey,
      nametag: sphere.identity?.nametag,
      intentId: result.intentId,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync("./data/provider-discovery.json", JSON.stringify(discovery, null, 2));
    log("provider discovery written to data/provider-discovery.json");
  } catch (err) {
    log("intent publish failed (non-fatal):", err);
  }
}

async function topUp(sphere: Sphere) {
  log("self-minting test tokens for agent-a...");

  try {
    const coinId = getCoinIdBySymbol(SERVICE.coin);
    if (coinId) {
      const result = await sphere.payments.mintFungibleToken(coinId, 1000n);
      log("mint result:", result.success ? "ok" : result.error);
    }
  } catch (err) {
    log("mint skipped:", err);
  }
}

async function listenForRequests(sphere: Sphere) {
  log("listening for incoming transfers...");

  // Poll for incoming transfers
  const { transfers } = await sphere.payments.receive(
    undefined,
    async (transfer) => {
      const firstToken = transfer.tokens?.[0];
      log("incoming transfer:", firstToken?.amount, firstToken?.symbol, "from", transfer.senderNametag || transfer.senderPubkey);

      // Try to parse the memo as a service request
      try {
        const request: ServiceRequest = JSON.parse(transfer.memo || "{}");
        if (!request.task) {
          log("transfer memo is not a service request, ignoring");
          return;
        }

        log("service request received:", request.task);

        // Fulfil the request
        const response = enrich(request);
        log("enrichment complete:", response.task);

        // DM the result back to the sender
        const senderNametag = transfer.senderNametag;
        if (senderNametag) {
          const recipient = `@${senderNametag}`;

          await sphere.payments.send({
            recipient,
            amount: "0",
            coinId: SERVICE.coin,
            memo: JSON.stringify(response),
          });

          log("result delivered to", recipient);
        } else if (transfer.senderPubkey) {
          log("no nametag, cannot DM result to pubkey:", transfer.senderPubkey);
        } else {
          log("no sender address, cannot deliver result");
        }
      } catch {
        // Not a JSON service request — ignore
      }
    }
  );

  if (transfers?.length) {
    log("processed", transfers.length, "pending transfers on boot");
  }
}

async function main() {
  log("booting agent-a (service provider)...");

  const sphere = await bootWallet();
  await topUp(sphere);
  await publishServiceIntent(sphere);
  await listenForRequests(sphere);

  log("agent-a is live and autonomous.");
  log("waiting for service requests via DM...");

  // Keep alive
  process.on("SIGINT", async () => {
    log("shutting down...");
    sphere.destroy();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(TAG, "fatal:", err);
  process.exit(1);
});
