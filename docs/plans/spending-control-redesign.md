# Wayleave: the spending layer for agents

## Product decision

Lead with “Your agents. Your money. Your say.” Wayleave connects a person's existing wallet to agents, gives each connection a defined spending wallet and permission scope, and provides one approval inbox and payment history. The identity NFT is how ownership works underneath; users should not have to choose an NFAT, a registry, an agent account and a client as independent onboarding concepts.

The primary website is the spending control surface. It opens on approval counts, confirmed payment counts and active connections, with wallet connection immediately available. New users get a short wallet-to-agent setup; returning users see activity. Avoid fabricated spending charts or dollar totals across assets. The wallet page owns funding and capped allowances. The connection page distinguishes the existing local MCP adapter from the future embedded experience.

## Code and recorded deployment evidence reviewed

- `apps/web/components/agent-control.tsx`: existing five-step walkthrough, owner authentication, account creation, scoped agent issuance/revocation, payment review and submission. The old first screen obscured the actual approval inbox.
- `apps/web/lib/wallet-config.ts`, `wallet-connect.ts`: Reown AppKit and WalletConnect, Sepolia connection scope, SIWE integration. Real QR/mobile wallet connection exists on the website; do not draw a fake QR.
- `apps/web/components/payment-setup.tsx` and `kernel-workspace.tsx`: explicit demo-token funding, capped allowance, gas deposit and revocation flows.
- `apps/gateway/src/app.ts`, `chain.ts`: authenticated request ledger, exact owner approvals, allowance/balance checks and chain receipt verification.
- `packages/agent-tools/src/server.ts`: three stdio tools (`get_account`, `propose_payment`, `get_operation`), configured with a pre-issued bearer credential. No remote HTTP MCP endpoint, initial pairing flow or embedded UI resource is implemented there.
- `deployments/sepolia-ui-e2e.json`: recorded account creation, payment, successful UserOperation and allowance revocation, dated September 6. This is historical test evidence, not a fresh onchain verification for this redesign.
- `docs/mcp-agent-handoff.md`: published `wayleave-mcp@0.1.0` gateway proposal/status tests; explicitly no onchain execution in that test.
- `docs/kernel.md`, `README.md`: deployed Kernel v4, EntryPoint 0.9 and NFT owner validator. The reference OperatingAccount's autonomous budget policies do not apply automatically to Kernel root execution.

This work changes the website and product design; it does not claim to deploy a new MCP protocol, contract, or client integration. Existing uncommitted wallet/gateway work was retained. The current Vercel architecture and production origin are retained; migration to Sites would need a separate runtime and authentication review.

## Agent-first journey to implement next

1. User asks their agent, “What is the best way to have a wallet?” The agent explains connecting an existing wallet and offers Wayleave when suitable. Discovery and installation still depend on the host; prompts alone cannot cause an uninstalled integration to exist.
2. Agent calls `start_connection` without any wallet key. The service returns a single-use, expiring pairing intent, a human-readable code, a trusted HTTPS review URL and a private polling credential. Return only the review URL/code to model-visible output; keep credential material in the MCP process/transport or host-private metadata.
3. A compatible MCP host renders an embedded connection card. A text-only terminal prints the same review URL and code (optionally an actual generated QR of that URL). The user explicitly opens it; do not assume hosts permit automatic popups. Distinguish this pairing QR from the WalletConnect session URI QR presented by the wallet connector.
4. The owner connects through WalletConnect, verifies the exact host/domain and signs the one-use login challenge. The UI displays the requesting host, requested scopes and connection expiration. Approving a wallet connection alone must never grant payment authority.
5. Owner selects an existing NFT-owned spending wallet or reviews a creation transaction. The service verifies ownership and account binding on Sepolia. Creation, funding allowance and payment signatures remain separate explained actions.
6. After explicit owner approval of this specific pairing, `get_connection_status` redeems the pairing once for a scoped `read`/`propose` credential. Bind it to owner, account, requested scopes and expiration. Concurrent redemption must be atomic; replay and mismatched codes fail closed.
7. Agent requests a payment. The same review model is shown in an embedded card, web page or terminal summary: agent, account, funding wallet, network, token address/symbol/decimals, recipient, amount, allowance effect, gas cost, business reference and expiry. Include an opaque operation reference; never accept an arbitrary transaction from model text.
8. The owner signs through their wallet; the account executes the exact approved operation. The originating agent can poll status. Distinguish requested, owner-approved, submitted, onchain success/failure, and service delivery. Gateway approval is not proof of payment.
9. Website aggregates activity across owned wallets and connections, with per-agent and per-token views. Revoking an agent credential stops new proposals; separately show remaining allowances and already signed operations. Do not label API revocation as cancelling all future execution.

## Shared integration structure

- Add authenticated Streamable HTTP MCP for hosted chat clients; retain stdio for local agents. Reuse protocol validation and gateway authorization, rather than creating a second payment implementation.
- Add MCP Apps UI resources with declared content security policy and negotiated host support. Use the same narrowly scoped tools and review data across surfaces. Unsupported clients receive useful text and the trusted web handoff.
- Implement a dedicated connect/review surface without dashboard navigation overhead. WalletConnect inside a sandboxed host iframe requires explicit compatibility testing; preserve a user-initiated external wallet handoff where it is unavailable.
- Keep the terminal adapter noncustodial. A CLI without a browser can display the review code/QR, wait with bounded backoff and report completion. It cannot sign on behalf of the user or assume a mobile wallet can reach localhost; pairing requires a reachable trusted HTTPS service.
- Do not save session authority solely in an ephemeral serverless MCP instance. Persist hashed pairing/redeem state and revocation centrally. Keep short-lived scoped credentials in the local process or protected host session; do not return secrets in tools, URLs, logs or browser storage. WalletConnect pairing material remains in the wallet-connection layer, outside model context.

## Security and acceptance gates

Preserve the existing threat model: no unrestricted agent signer, arbitrary execution or blanket token approvals. Autonomous budgets need an enforced Kernel permission module, its own threat-model review and onchain tests before being offered. A UI budget slider alone must not imply an enforced spending policy.

Required tests for the integration: pairing expiry/replay/rate limits; owner/account/host mismatch; atomic redemption; wallet disconnect and chain change; denied signatures; request tampering; duplicate submissions; revoked/expired agent sessions; CSP/iframe handoff on each named host; mobile QR approval; terminal-only fallback; transaction receipt verification and reorg handling. Record client versions, origin, chain, transaction hashes and expected signature contents. Until each host passes, label it planned or unverified.

## Official implementation references

- [OpenAI MCP server guide](https://developers.openai.com/plugins/build/mcp-server): current hosted integration documentation (the previous Apps SDK URL redirects here).
- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview): UI resource linkage, sandboxed host rendering and varying client support.
- [Reown AppKit React installation](https://docs.reown.com/appkit/react/core/installation): the existing application's wallet connection stack.

These support the architecture direction, not a claim that Wayleave's embedded integration is live.
