# Agent access and human control panel — implementation plan

Status: proposed implementation sequence; September 5, 2026. This document authorizes no new signing authority or deployment. Sepolia remains the testing chain.

## Outcome

An owner connects an agent to an account through the web app. The agent can inspect the permitted context, propose a structured payment, learn whether it needs approval, and retrieve its outcome. The owner sees requests, approves exact actions, grants bounded mandates, and revokes access. Routine actions can later execute within an onchain mandate while exceptions wait for an owner signature.

First vertical slice: “Buy this report for 3 demo USDC.” The agent creates a request, the dashboard requests a signature, a worker submits the approved operation, and both surfaces show settlement and report delivery separately. Closing the browser or restarting a service must not lose or duplicate the request.

## Starting point

Implemented: Sepolia Kernel v4 / EntryPoint 0.9 accounts, NFT owner validator, owner-balance ERC-20 allowance, generated ABIs, connected-wallet setup/payment UI, and contract/SDK tests. Read docs/kernel.md for authority boundaries and deployments/ for transaction evidence.

The browser policy tool currently previews simulated policies only. It is not authenticated agent access or a payment tool. The working tree also contains a local development-wallet adapter and browser-test work; treat these as test infrastructure, not the production signing service. Preserve that work during implementation.

Missing: durable operations, authenticated agent connections, human sessions, approval routing, reliable background submission/reconciliation, session-key policy enforcement, provider delivery adapters, and a dashboard reflecting those states.

## Architecture and defaults

Agent client → scoped tool API → operation service → approval inbox or mandate authorization → transaction worker → Kernel / EntryPoint.

The dashboard reads and controls the same operation service. Chain reconciliation and service-delivery workers append evidence to that service. A model proposes intent; deterministic code constructs allowed calls. The model never receives the owner's private key or a generic signing endpoint.

Use Bun for services, scripts and package management, Foundry for modules and contract tests, and the existing wagmi frontend. Start with a single Bun service and SQLite durable storage for the local demo; introduce a shared database and distributed workers only when hosting or multiple replicas require them. Keep a database-backed job queue so jobs survive restarts.

Proposed repository additions:

- `apps/gateway`: authenticated API, operation ledger, approval endpoints, submission/reconciliation and delivery workers.
- `packages/protocol`: versioned intent, approval, receipt and error schemas shared by dashboard, service and tools.
- `packages/agent-tools`: thin MCP adapter over the same service; no separate policy logic.
- `packages/contracts`: a constrained mandate module / hook only after the compatibility spike.
- `apps/web`: agent connections, overview, approval inbox, operations and mandate management.

Three separate permissions must remain visible: API access lets an agent request work; onchain authority permits account execution; the token allowance permits spending from a particular funder's balance. Connecting an agent does not imply either of the latter two.

## Milestone 1 — Durable requests and human approval

Build the smallest useful product without autonomous signing.

Deliverables:

- Wallet-based human authentication with a one-time challenge bound to domain, chain, address and expiry; protect browser session writes and check current NFT ownership for privileged actions.
- Agent connection records scoped to an owner/workspace, chain and account, with read/propose permissions, expiry, revocation and audit identity. Start local; do not use the deployment wallet as a service credential.
- Structured `PaymentIntent`: account, chain, funding owner, token, recipient, amount in base units, business reference, expiry and idempotency key. Store the immutable canonical request hash and revision. Resolve addresses from approved provider configuration, not untrusted invoice prose.
- A durable operation ledger, signed-payload records, approval decisions and append-only audit events. Secrets and replayable signed payloads are access-controlled and excluded from ordinary logs.
- Approval inbox showing who requested the action, its purpose, exact token/amount/recipient/funding source, fees, simulation result, expiry and policy reason. Owner can approve or reject; changing material fields creates a fresh revision and approval.
- Tools: `list_accounts`, `get_balances`, `propose_payment`, `get_operation`, `list_pending_approvals`. A proposal returns an operation ID, state and dashboard URL; it does not hold a tool call open until a human signs.
- An authenticated local MCP adapter. Browser WebMCP may be a convenience surface, but agent access must work without relying on an open dashboard tab. Remote HTTP MCP adds standards-based authorization before exposure.

Definition of done:

An actual connected agent creates a Sepolia demo payment request. You see and sign it in the inbox; rejection produces no signature or transaction. The agent retrieves the decision. Restart/reconnect preserves the request. Reusing the same idempotency key with the same payload returns the existing operation; reusing it with different parameters fails. Cross-account access, expired sessions, replayed login challenges, and revoked connections are rejected.

No contract migration is required for this milestone. The existing owner authorization is the signing path. Initially, the current frontend can submit after signing; milestone 2 moves that responsibility to a durable worker.

## Milestone 2 — Submission, signature lifecycle and receipts

Separate approval from transport so the browser does not have to stay open.

Deliverables:

- A Sepolia submission worker using a dedicated gas-only EOA, or a provider proven compatible with the pinned Kernel and EntryPoint. The bundler cannot manufacture owner signatures or receive root authority. Start with direct EOA submission if hosted compatibility is unresolved.
- UserOperation preparation, simulation, nonce allocation/serialization per account, fee ceilings, gas-deposit monitoring and bounded retry behavior. Store the signed payload and its hash before submission; reconcile ambiguous submissions before any retry.
- Revalidate owner, ownership epoch, authorization, allowance, fees and intent immediately before signing/submission. Material payload changes require another owner signature. Increasing signed fee fields or selecting a new nonce is not a transport-only retry.
- Separate states for approval, execution and delivery. Execution distinguishes prepared, submitted, included, confirmed, reverted, dropped/unknown and reorged. A successful outer receipt is insufficient: inspect the matching UserOperation event and transfer evidence.
- Poll and recover independently of the UI. Dashboard updates can use SSE; agent clients poll or subscribe through supported authenticated transport. Notifications link to the approval inbox and never imply that reading a notification grants consent.
- Define real cancellation semantics. Rejecting an unsigned proposal is immediate; an already signed/submitted operation may still execute. Persist that distinction. Add a tested nonce-invalidation procedure where applicable. If enforceable deadlines are needed, extend validator authorization to include an onchain validity interval and deploy a versioned migration; the current signature format has no such deadline.

Definition of done:

A signed request settles with the browser closed. Worker restart after broadcast does not create a second payment. Tests cover concurrent requests, RPC timeouts, transaction replacement, inner execution failure, fee changes, insufficient gas and chain reorganization. Receipt evidence includes chain, block/hash, UserOperation hash, transaction hash, token effects and confirmation level.

Gateway idempotency is a guarantee for this managed path, not universal onchain business-request deduplication. Never claim exactly-once execution merely because a database has a unique key.

## Milestone 3 — Bounded autonomous mandates

Only begin autonomous spending after revisiting the execution threat model and proving the module paths.

First perform a bounded compatibility spike comparing ZeroDev permissions and Rhinestone session tooling against our exact Kernel revision and EntryPoint. Test installation, signature envelope, execution hooks, revocation and owner-epoch handling. Standards labels or documentation examples are not proof of this particular combination working. Record the selected source revision and why it meets the required checks; retain our NFT owner validator as the default root.

Mandate contents: agent/session identity, chain/account, funding owner, token, approved recipient set, per-payment cap, total cap, valid-after/expiry, mandate ID and ownership epoch. A demo mandate can be 3 demo USDC per payment, 8 total, one provider, one hour. These are proposed demo settings, not a grant being issued now.

Deliverables:

- Human-reviewed mandate creation and installation. Separate agent transport credentials from a revocable session signing key held in an isolated signer/keystore; never put it in prompts, frontend bundles or general tool outputs.
- A deterministic signer that accepts only an authorized canonical intent and builds the constrained operation. Initial delegated calls permit exact ERC-20 transferFrom payments; no generic calldata, delegatecall, upgrades, module installation, unlimited approvals or root-management access.
- Onchain validation and execution-time enforcement for funding source, targets, amounts, time and owner epoch. Account for multiple operations validated before execution; update spending atomically and roll back when payment fails. Block alternative call encodings and nested batches that evade decoding.
- Business-request replay protection in the constrained execution path where the product promises it, paired with the durable gateway ledger. This can live in a module/hook; it does not require a separate token-custody/spending gateway.
- Out-of-policy requests return `approval_required` with a reason. A one-off owner exception is a separate exact action; it does not silently widen the mandate.
- Emergency controls distinguish stopping API requests, revoking the onchain mandate, and revoking the owner's ERC-20 allowance. Show pending vs confirmed revocation and the possibility of earlier ordered execution.

Definition of done:

The agent performs an in-policy payment without a fresh owner signature. Wrong recipient, over-budget, expired/revoked mandate, duplicate request, ownership change, and forbidden execution routes fail onchain even if the gateway is bypassed. Include adversarial bundle tests and signer-key rotation. Revoking API access alone must never be represented as invalidating already issued chain authority.

## Milestone 4 — Human control panel and complete service workflow

Expand the approval inbox rather than replacing it.

Screens: account overview (owner funds, token allowance, account gas deposit and delegated budget separately); agents (identity, connection status, scope and last activity); mandates (limits, expiry and revoke controls); approvals (reason and exact effects); operations (request → settlement → delivery with evidence and failures).

Add one deterministic paid-report provider. Bind the delivery request to the payment/business reference and record an authenticated provider receipt or artifact. Distinguish a real provider integration from a demo stub. If payment succeeds but delivery fails, retry delivery using the existing payment evidence; do not pay again automatically.

Definition of done:

Demonstrate connect agent → request report → approve first payment → view report → grant a bounded mandate → autonomous allowed payment → blocked exception → human rejection/approval → delivery failure and recovery → revocation. The dashboard explains the same facts that the agent tools return.

## Milestone 5 — Ownership lifecycle and buyer demonstrations

Before encouraging NFT handover, inventory installed modules, active mandates, pending approvals, signed operations, gas deposits and external token allowances. Freeze new managed requests during the workflow, invalidate delegated authority using the ownership epoch, and require explicit funder reauthorization for the new owner. Do not claim all external approvals can be discovered or cleared automatically; track known approvals and disclose that inventory's scope. Root upgrades can change governance and require a separate policy decision.

Then add live ENS under a controlled parent, provider-specific signed token funding, production hosting/remote authorization, stronger signer custody, and sponsor or chain integrations as separate proof-driven milestones. None blocks the first assisted-agent flow. Native ETH spending from an EOA is a separate funding design from ERC-20 allowance.

For buyer demos, reuse the same request/approval/execution/receipt interfaces and implement narrow adapters for a provider purchase, a tokenization operation, or an administrative workflow. Do not start by implementing three full verticals.

## Order and decisions

Start milestone 1 now when implementation is requested; complete milestone 2 before unattended submission and milestone 3 before autonomous signing. Milestone 4 UI work can evolve alongside each slice. Milestone 5 follows the core demo.

Defaults: Sepolia + demo USDC; local Bun service; SQLite; human approval for every payment initially; MCP as the first agent interface; one provider; existing NFT owner validator retained. Alchemy improves RPC access but is not a prerequisite for the first slice. A continuously running worker is necessary for background reconciliation; connecting this chat does not itself create an always-running agent. Ongoing agent jobs require an explicitly configured runner and granted scope.

Research gates, not blockers for milestone 1: session module compatibility; hosted bundler support for EntryPoint 0.9; remote identity/hosting model; token-specific permit flows; ownership migration rules.

Validation: Foundry module/adversarial tests; Bun service tests against real durable storage; mocked failures plus live Sepolia evidence; browser approval tests; account-isolation/auth tests; full `bun run check` and Anvil smoke when implementation spans contracts and frontend. This planning-only change does not alter runtime behavior.

## References

- [Existing Kernel architecture](../kernel.md) and [Sepolia evidence](../sepolia.md).
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization): separate transport authentication from wallet authority; use its HTTP authorization flow when adding remote access. Local stdio uses environment-supplied credentials rather than that HTTP flow.
- [ZeroDev permissions](https://docs.zerodev.app/smart-accounts/permissions/intro) and [Rhinestone documentation](https://docs.rhinestone.dev/): inputs for the compatibility spike, not claims of tested compatibility with our deployment.
