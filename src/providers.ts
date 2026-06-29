/**
 * Minimal wallet-api providers: delivery only, no walletApi client.
 * This prevents the SDK from making wallet-api calls for payment requests,
 * history, or inventory sync — which trigger rate-limiting.
 */

import { createOwnStorageWalletApiProviders } from "@unicitylabs/sphere-sdk/impl/shared/wallet-api";

/**
 * Create providers with delivery-only wallet-api (no walletApi client).
 * The SDK's PaymentsModule skips payment-request polling when no walletApi
 * client is present.
 */
export function createDeliveryOnlyProviders(base: any, config: any) {
  const full = createOwnStorageWalletApiProviders(base, config);

  // Remove the walletApi client so the SDK doesn't try to poll
  // payment-requests, history, or inventory from the wallet-api.
  // Only the delivery port (mailbox) remains.
  const { walletApi, ...deliveryOnly } = full;
  return deliveryOnly;
}
