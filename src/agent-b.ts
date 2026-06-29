/**
 * Agent B — The Service Consumer ("scout")
 *
 * Autonomous agent that:
 * 1. Boots a Sphere wallet on testnet2
 * 2. Searches the intent market for "data-enricher" services
 * 3. Sends a service request + payment to Agent A via DM
 * 4. Listens for the enriched result
 *
 * No human in the loop after startup.
 */

import { Sphere, getCoinIdBySymbol } from "@unicitylabs/sphere-sdk";
import { createNodeProviders } from "@unicitylabs/sphere-sdk/impl/nodejs";
import { createWalletApiProviders } from "@unicitylabs/sphere-sdk/impl/shared/wallet-api";
import { AGENT_B, NETWORK, ORACLE_API_KEY, SERVICE } from "./shared.js";
import type { ServiceResponse } from "./shared.js";

const TAG = "[agent-b scout]";

function log(...args: unknown[]) {
  console.log(TAG, new Date().toISOString(), ...args);
}

async function bootWallet() {
  const base = createNodeProviders({
    network: NETWORK,
    dataDir: "./data/agent-b/data",
    tokensDir: "./data/agent-b/tokens",
    oracle: { apiKey: ORACLE_API_KEY },
  });

  const providers = createWalletApiProviders(base, {
    baseUrl: "https://wallet-api.unicity.network",
    network: "testnet2",
    deviceId: "agent-b-scout",
  });

  const { sphere, created, generatedMnemonic } = await Sphere.init({
    ...providers,
    autoGenerate: true,
    nametag: AGENT_B.nametag,
  });

  if (created && generatedMnemonic) {
    log("NEW WALLET — save this mnemonic:", generatedMnemonic);
  }

  log("wallet ready");
  log("  address:", sphere.identity?.directAddress);
  log("  nametag:", sphere.identity?.nametag);

  return sphere;
}

async function topUp(sphere: Sphere) {
  log("self-minting test tokens...");

  try {
    const coinId = getCoinIdBySymbol(SERVICE.coin);
    if (coinId) {
      const result = await sphere.payments.mintFungibleToken(coinId, 5000n);
      log("mint result:", result.success ? "ok" : result.error);
    }
  } catch (err) {
    log("mint failed (non-fatal):", err);
  }
}

async function searchMarket(sphere: Sphere): Promise<string | null> {
  log("searching intent market for data-enricher...");

  try {
    const market = sphere.market;
    if (!market) {
      log("market module not available");
      return null;
    }

    const result = await market.search("data-enricher", {
      limit: 5,
    });

    log("market results:", result.count);

    if (result.intents && result.intents.length > 0) {
      for (const intent of result.intents) {
        log("  found:", intent.description?.substring(0, 100));
        // The intent author is the provider
        const providerTag = intent.contactHandle || intent.agentNametag;
        if (providerTag) {
          log("  provider found:", providerTag);
          return providerTag;
        }
      }
    }
  } catch (err) {
    log("market search failed:", err);
  }

  return null;
}

async function requestService(
  sphere: Sphere,
  providerNametag: string,
  task: string,
  data: Record<string, unknown>
): Promise<void> {
  const request = { task, data };
  const paymentMemo = JSON.stringify(request);

  log(`sending service request to @${providerNametag}...`);
  log(`  task: ${task}`);
  log(`  payment: ${SERVICE.price} ${SERVICE.coin}`);

  const result = await sphere.payments.send({
    recipient: `@${providerNametag}`,
    amount: SERVICE.price,
    coinId: SERVICE.coin,
    memo: paymentMemo,
  });

  log("payment sent:", result.status);
  if (result.deliveryPending) {
    log("  (delivery pending — this is normal)");
  }
}

async function listenForResult(sphere: Sphere): Promise<ServiceResponse | null> {
  log("listening for enrichment result...");

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      log("timeout waiting for result (60s)");
      resolve(null);
    }, 60_000);

    sphere.payments.receive(undefined, async (transfer) => {
      try {
        const response: ServiceResponse = JSON.parse(transfer.memo || "{}");
        if (response.result && response.task) {
          log("RESULT RECEIVED!");
          log("  task:", response.task);
          log("  result:", JSON.stringify(response.result, null, 2));
          clearTimeout(timeout);
          resolve(response);
        }
      } catch {
        // not our result
      }
    }).catch(() => {});

    // Also check existing assets
    sphere.payments.getAssets().then((assets) => {
      log("current assets:", assets.length);
    }).catch(() => {});
  });
}

async function main() {
  log("booting agent-b (service consumer)...");

  const sphere = await bootWallet();
  await topUp(sphere);

  // Step 1: Find a service provider on the market
  let providerTag = await searchMarket(sphere);

  if (!providerTag) {
    log("no provider found on market, using default: @enricher");
    providerTag = "@enricher";
  }

  // Step 2: Send a service request with payment
  await requestService(sphere, providerTag, "lookup", {
    query: "Unicity testnet status",
    context: "autonomous agent discovery test",
  });

  // Step 3: Listen for the result
  const result = await listenForResult(sphere);

  if (result) {
    log("=== SERVICE COMPLETE ===");
    log("task:", result.task);
    log("result:", JSON.stringify(result.result, null, 2));
    log("timestamp:", result.timestamp);
  } else {
    log("no result received within timeout");
  }

  // Keep running to receive follow-up messages
  log("agent-b staying alive for follow-up messages...");

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
