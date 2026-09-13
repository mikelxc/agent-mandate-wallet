# Wayleave as the first merchant

Implemented locally: a versioned Developer Pack offering, durable quote/acceptance/fulfillment storage, five MCP purchase tools, a focused approval link in Payments and the final onboarding purchase step. These are code and local-test results, not evidence of a live purchase.

## Configuration

For the local demo, the user selected the existing deployment wallet `0x96B0D15128748cE191B79c75560Ed93695788865` as the receiving address. This is configured in the ignored local environment; hosted environment configuration is separate.

Set `WAYLEAVE_MERCHANT_RECIPIENT` to the intended receiving wallet on Ethereum Sepolia in the gateway/hosted server environment. No wallet is assumed. Checkout is unavailable without a valid recipient and configured Arc adapter. `WAYLEAVE_PACK_PRICE_UNITS` defaults to `100000` (0.10 test USDC); `WAYLEAVE_PACK_MAX_FEE_UNITS` defaults to `1000` (0.001 USDC). The approved debit is 0.101 USDC, with merchant receipt between 0.10 and 0.101 USDC; gas is extra. Unused fee budget reaches the merchant. These terms are displayed in onboarding and returned in the quote. This is not exact-net pricing.

Use the existing Arc deployment settings described in `arc-circle.md`. No deployment or transaction is automatically submitted by the merchant layer.

## Real purchase path

1. Configure the recipient and Arc deployment. Connect the Arc funding owner and provision test funds/allowance/account gas using existing owner-reviewed controls.
2. Establish a portable ENS identity with read and propose-payment scopes and an explicitly associated Arc account. The Arc-first onboarding verifies an ENS identity on Sepolia, creates or verifies an Arc NFT wallet, explicitly associates it, and issues a bearer token for read/propose access after the owner signs its selected session length and account binding. It ends with this purchase. A fresh ENS name is registered through the linked hackathon app; existing account-owned names require a compatible controller wallet.
3. Build the current MCP with `bun run --cwd packages/agent-tools build` and run `bun packages/agent-tools/dist/cli.js` from the checkout with your portable identity environment configured. The published/pinned older MCP package is not evidence that these new tools are installed. Use the final onboarding step's instruction. MCP calls `list_offerings`, `get_purchase_quote`, `request_purchase`; the latter returns a URL identifying exactly one operation and purchase.
4. Open the approval URL, sign in with the owner and load requests. Inspect the open matching request, prepare it, approve, and send on Arc. After the Circle attestation arrives, complete the destination submission on Sepolia using the existing UI.
5. MCP checks `get_purchase` and retrieves `get_purchase_delivery`. The gateway verifies the already-reconciled CCTP operation's immutable terms, recipient amount and settlement nonce allocation before returning files.
6. The agent reads the pack and completes the user's task. The owner may also check and download the pack from onboarding or the purchase panel. The checklist completes only after retrieval or a persisted available-delivery record is checked; copying instructions and creating credentials do not complete it.

## Endpoints and scope

- `GET /merchant/offerings`: public configuration/availability, no private history.
- `POST /agent/merchant/quotes`: authenticated Arc agent; `{offeringId,idempotencyKey}` only. Recipient, token and prices come from the merchant configuration.
- `POST /agent/merchant/quotes/:id/purchase`: authenticated original agent, empty JSON body; quote/account/controller epoch bound.
- `GET /agent/merchant/purchases/:id[ /delivery]`: authenticated original agent, current membership/account association, read scope.
- `GET /merchant/purchases` and `GET /merchant/purchases/:id[ /delivery]`: original funding owner's authenticated cookie. No public download tokens.

Purchase responses exclude prepared operations, owner signatures and Circle attestations. URL IDs locate records but grant no access. The MCP and app share the gateway's SQL records; the browser never contacts the local stdio MCP process.

## Persistence and failure behavior

Quotes are immutable and owner/agent/account/ownership-epoch bound. The agent idempotency key pins the first quote. Acceptance is saved before CCTP operation creation; a crash/retry resumes it through a quote-specific CCTP idempotency key. Expiry limits initial acceptance, not delayed approved execution. The fulfillment table has a unique chain/nonce allocation so one receipt cannot unlock multiple purchases, even if economically identical prepared operations are reconciled elsewhere.

Content is a bundled JSON download with individual files and per-file SHA-256 hashes; the offering pins the bundle digest and version. The public repository remains free. No invoice funds are escrowed and no automatic refunds are implemented. Paid-but-undelivered cases retain their payment evidence and can retry delivery; a missing artifact version fails closed.

`scripts/build-developer-pack.ts` embeds an explicit allowlist of public source/docs/manifests and example CSV data. It never walks the repo or reads environment files. Keep old paid versions available before changing the artifact; this first release only serves v1. Regenerating the same version with changed bytes invalidates old quotes by digest, so bump versions and add historical artifact serving before an update.

## Verification boundaries

Local verification on September 12, 2026: `bun run check` passed (production build, all workspace typechecks, 146 Bun tests and 61 Foundry tests). The focused onboarding, merchant, payment and integration browser suite passed all 15 checks at desktop and mobile sizes. The merchant package also passed a package-content dry run. No npm publication, hosted deployment or live payment was performed.

Merchant unit tests cover concurrent/repeated requests, expiry, changed account authority, cross-owner/agent access, underpayment, premature delivery, restart persistence, duplicate receipt allocation and artifact integrity. The MCP integration test uses a real stdio client and HTTP gateway with explicitly simulated chain-adapter settlement. Browser tests use fixtures. A live completion still requires owner-approved source/destination transactions and real ENS identity, account-association and token-authorization evidence. Automatic destination relaying and public merchant onboarding remain unfinished integrations.

Arc-first follow-up verification: the full `bun run check` passed, followed by the Anvil deployment/execution smoke test. Fifteen focused onboarding/payment browser checks passed; the three wallet-auth checks passed, and all eight navigation/WalletConnect checks passed on the final run. Browser tests use fixtures and do not establish a live Arc deployment, ENS enrollment or CCTP settlement.

## Public storefront and purchase tracking

`/store/developer-pack` is the separate public product page; `/store/developer-pack/agent` serves a plain-text purchase guide without login or client JavaScript. The product page directs agents to their already configured Wayleave connection and current catalog/quote. It never receives private keys or authorizes spending. The intended public URL is `https://www.wayleave.xyz/store/developer-pack`; adding this route locally is not evidence that it has been deployed there.

The final onboarding step reuses the production `onboarding.module.css` shell and context layout. Its instruction sends the agent to the store. The right panel follows the actual owner-scoped purchase instead of a simulated payment. Payments uses the same tracker alongside the approval workspace. Each tracker pins the selected purchase, refreshes saved gateway records every ten seconds while visible, and clears its records on owner changes/sign-out. Polling does not sign, submit, or automatically reconcile blockchain transactions; the owner completes source, attestation and destination steps in Payments.

Request, approval, verified source receipt, verified merchant receipt and retrieved artifact are separate milestones. A settled status alone cannot mark delivery complete: the artifact must have been retrieved with its pinned digest. Downloads recheck the purchase identity, version and bytes before offering the file. Tests exercise stored-status transitions and polling using explicitly simulated merchant records; they are not live payment evidence.

Storefront follow-up verification: `bun run check` passed with 154 Bun tests and 61 Foundry tests. The final 16-check onboarding/payment suite and 10-check storefront/auth suite passed, including mobile/desktop layout, reading the storefront with JavaScript disabled, automatic owner-scoped polling, settlement-versus-delivery states and clearing the tracker on sign-out. The store bypasses wallet-provider initialization and uses a public navigation frame. No deployment or live purchase was performed.

## Self-serve merchant package direction

The current `createMerchantClient` is a buyer/agent client. Keep its quote,
request, status and delivery methods separate from a future merchant server
entrypoint. Public purchase pages are agent discovery documents; they never
receive buyer credentials or dictate trusted payment recipients.

The next implementation slice is a merchant registry with tenant-scoped
credentials, verified domains, offerings and immutable offering versions.
Convert Wayleave into its first registered merchant and prove tenant isolation
with a second fixture merchant before building the self-serve dashboard.
A server SDK can then expose `createOffering`, `publishOfferingVersion`,
`getPurchase`, `listPurchases`, and `verifyWebhook`. The gateway retains quote
validation, owner approval, CCTP receipt verification and unique receipt
allocation. Signed, durably retried `purchase.settled` events let merchants
fulfill orders; do not expose a generic `markPaid` API.

Before npm publication, split buyer/server exports, define versioned payment
states, validate responses at runtime, add typed errors, generalize delivery
beyond bundled files, and test an installed tarball outside this monorepo.
Keep the package private until these boundaries stabilize. Merchant registration,
webhooks and multi-tenant catalogs are planned, not implemented.

## Production release — September 12, 2026

Released the Arc-first onboarding, public agent purchase endpoint, owner purchase
tracking and hosted MCP integration to `https://www.wayleave.xyz` as Vercel
`dpl_FRxS4Xj4bTpNuDBwPBjakoV4mDVV`. Configured the previously selected merchant
recipient as server-only `WAYLEAVE_MERCHANT_RECIPIENT`. Live read-only checks
returned the available 0.10 test-USDC catalog entry and configured Arc route.
Vercel production build, all workspace typechecks, 154 Bun tests and 61 Foundry
tests passed. The local combined build stalled under the sandbox; hosted build
validation and separately run tests completed successfully.

The purchase prompt links to Circle's public faucet and identifies the connected
owner address to fund. Circle currently dispenses 20 Arc test USDC. The payment
still requires owner-reviewed allowance/account gas setup and Sepolia ETH for
the destination transaction. This release is not evidence of a live completed
purchase; no owner payment or public-chain deployment was submitted.
