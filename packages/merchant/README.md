# Wayleave merchant SDK (local preview)

Framework-independent TypeScript contracts and client for merchant offerings, immutable quotes, purchase requests and verified-content delivery. ESM and declarations build into `dist`; the package has no runtime dependencies, React, database, wallet or key-storage assumptions.

The package is intentionally private while the API stabilizes. Its name has not been reserved and nothing has been published. Before npm publication, choose the package name, remove `private`, review the API and license, and inspect `bun pm pack --dry-run`. The packed module uses compiled ESM exports, never monorepo source paths or workspace dependencies.

## Usage

```ts
import { createMerchantClient, verifyDelivery } from 'wayleave-merchant';

// Supply your application's authenticated transport to a deliberately configured
// Wayleave gateway. Do not forward credentials to URLs discovered in ENS records.
const merchant = createMerchantClient(authenticatedGatewayRequest);
const { offerings } = await merchant.listOfferings();
const quote = await merchant.getPurchaseQuote({
  offeringId: offerings[0].id,
  idempotencyKey: 'my-purchase-attempt-001',
});
const purchase = await merchant.requestPurchase(quote.id);
// Show purchase.approvalUrl to the owner. The client never signs or moves funds.
// Once the owner completes payment, check status and retrieve the purchased files.
const state = await merchant.getPurchase(purchase.id);
if (state.paymentStatus === 'settled') {
  const delivery = await merchant.getPurchaseDelivery(purchase.id);
  await verifyDelivery(delivery, quote.offering.contentSha256);
}
```

`MerchantRequest` is a generic `(path, RequestInit?) => Promise<T>` transport. The current gateway's agent endpoints require a scoped, enrolled identity associated with an Arc account. An ENS name is not a credential. Public catalog reads use `/merchant/offerings`.

## Payment semantics

All amounts are integer strings in six-decimal USDC base units. `quoteAmounts(price, maximumFee)` produces a fixed source debit equal to price plus the fee budget. Merchant receipt is bounded between price and that debit. Unused fee budget reaches the merchant; it is not a refund. Gas is additional. The current adapter supports Arc Testnet → Ethereum Sepolia only.

Quotes expire for initial acceptance after 15 minutes. Once accepted, retries resume the same purchase and CCTP operation, including after expiry. This expiry does not cancel an approved UserOperation onchain. Do not create a new quote just because settlement is pending.

Payment and delivery states are separate. A source burn, signature or transaction hash is insufficient for fulfillment. The gateway adapter verifies destination CCTP receipts and allocates a unique destination nonce to one purchase before releasing files. Content digests prove artifact integrity, not payment.

## Boundaries for future merchants

- This package owns the versioned public types, deterministic amount arithmetic, typed client and content verification.
- The gateway owns authenticated access, immutable quote storage, request idempotency, payment-adapter verification and receipt allocation.
- The first merchant owns a fixed, versioned Developer Pack. External merchant registration, independent settlement adapters, notifications and fulfillment webhooks are future work.
- Do not expose a generic `markPaid` API or accept browser-supplied settlement assertions.

Build with `bun run build`; test with `bun run test`. Root `bun install` builds the package for workspace consumers.
