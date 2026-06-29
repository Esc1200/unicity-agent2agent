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
import { createOwnStorageWalletApiProviders } from "@unicitylabs/sphere-sdk/impl/shared/wallet-api";
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

  const providers = createOwnStorageWalletApiProviders(base, {
    baseUrl: "https://wallet-api.unicity.network",
    network: "testnet2",
    deviceId: "agent-b-scout",
  });

  let sphere: Sphere;
  try {
    const result = await Sphere.init({
      ...providers,
      autoGenerate: true,
      nametag: "cli-wyirmepy",
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

  return sphere;
}

async function topUp(sphere: Sphere) {
  log("self-minting test tokens...");

  try {
    const coinId = getCoinIdBySymbol(SERVICE.coin);
    if (coinId) {
      const result = await sphere.payments.mintFungibleToken(coinId, 10000000n);
      log("mint result:", result.success ? "ok" : result.error);
    }
  } catch (err) {
    log("mint failed (non-fatal):", err);
  }
}

async function searchMarket(sphere: Sphere): Promise<string | null> {
  // First: try local discovery file (written by Agent A)
  try {
    const fs = await import("fs");
    const discovery = JSON.parse(fs.readFileSync("./data/provider-discovery.json", "utf-8"));
    if (discovery.address) {
      log("  discovered provider via local file:", discovery.address);
      return discovery.address;
    }
  } catch {
    // No discovery file — fall through to market search
  }

  log("searching intent market for data-enricher...");

  try {
    const market = sphere.market;
    if (!market) {
      log("market module not available");
      return null;
    }

    const result = await market.search("data-enricher", {
      limit: 10,
    });

    log("market results:", result.count);

    if (result.intents && result.intents.length > 0) {
      // Find the most recent intent with an address
      for (let i = result.intents.length - 1; i >= 0; i--) {
        const intent = result.intents[i];
        try {
          const parsed = JSON.parse(intent.description || "{}");
          if (parsed.service === "data-enricher" && parsed.address) {
            log("  found provider:", parsed.address);
            return parsed.address;
          }
        } catch {
          // not JSON
        }
      }
      // Fallback: use contactHandle (nametag)
      const fallback = result.intents[result.intents.length - 1];
      const tag = fallback.contactHandle || fallback.agentNametag;
      if (tag) {
        log("  fallback provider:", tag);
        return `@${tag}`;
      }
    }
  } catch (err) {
    log("market search failed:", err);
  }

  return null;
}

async function requestService(
  sphere: Sphere,
  providerAddress: string,
  task: string,
  data: Record<string, unknown>
): Promise<void> {
  const request = { task, data };
  const paymentMemo = JSON.stringify(request);

  log(`sending service request to ${providerAddress}...`);
  log(`  task: ${task}`);
  log(`  payment: ${SERVICE.price} ${SERVICE.coin}`);

  // Check balance first — v2 minted tokens may need a moment to settle
  const assets = await sphere.payments.getAssets();
  const uctAsset = assets.find((a) => a.symbol === SERVICE.coin);
  log("  balance:", uctAsset?.totalAmount || "0", SERVICE.coin);

  if (!uctAsset || BigInt(uctAsset.totalAmount) < BigInt(SERVICE.price)) {
    log("  insufficient balance, waiting 10s for minted tokens to settle...");
    await new Promise((r) => setTimeout(r, 10_000));
    const retryAssets = await sphere.payments.getAssets();
    const retryUct = retryAssets.find((a) => a.symbol === SERVICE.coin);
    log("  retry balance:", retryUct?.totalAmount || "0", SERVICE.coin);
  }

  try {
    const result = await sphere.payments.send({
      recipient: providerAddress,
      amount: SERVICE.price,
      coinId: SERVICE.coin,
      memo: paymentMemo,
    });

    log("payment sent:", result.status);
    if (result.deliveryPending) {
      log("  (delivery pending — this is normal)");
    }
  } catch (err: any) {
    log("payment failed:", err.code || err.message);
    log("  (service request still sent via memo, provider will see it)");
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

  // Wait for wallet-api to settle (avoid rate limiting)
  log("waiting 10s for wallet-api to settle...");
  await new Promise((r) => setTimeout(r, 10_000));

  // Step 1: Find a service provider on the market
  let provider = await searchMarket(sphere);

  if (!provider) {
    log("no provider found on market");
    return;
  }

  log("sending to provider:", provider);

  // Step 2: Send a service request with payment
  await requestService(sphere, provider, "lookup", {
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
