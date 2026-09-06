# Agent access: first implementation milestone

Implemented September 6, 2026. This is the local human-approval flow from docs/plans/agent-control-plane.md. It does not install session signing authority or add a hosted background bundler.

## Run and connect

Run `bun run gateway` and `bun run dev` in separate terminals. Use the existing frontend at http://localhost:3000, choose Agent control, connect a Sepolia wallet, and sign the sign-in challenge. The local test-wallet adapter intentionally does not provide the new login signing interface; use a normal injected wallet. A login signature grants no spending authority.

Enter an existing Kernel account you own and create a named connection. Copy the one-time connection key into a compatible MCP host's environment using MANDATE_AGENT_TOKEN. Connection credentials expire after 24 hours and are revocable. Follow [the adapter setup guide](../packages/agent-tools/README.md). Creating these files does not register tools in an already-running agent conversation; configure/reconnect the client explicitly.

Tools: get_account, propose_payment, get_operation. A proposal returns a durable operation ID and an approval URL. The agent can inspect its own requests; it cannot approve, sign or obtain owner signatures. Only the deployed demo USDC is currently accepted.

The account needs an owner token allowance and a gas deposit; configure these in the Sepolia wallet tab. In Agent control, review a request, inspect the exact payment and maximum gas reservation, sign it, and confirm the submission transaction. Rejection stores a decision without signing. The current submission flow requires an undelegated EOA; a separate bundler for smart-wallet owners is still pending.

## Architecture and security boundary

- packages/protocol validates exact intents and computes canonical hashes. Amounts are base-unit strings and expiry is Unix seconds, at most 24 hours ahead.
- apps/gateway is a Bun HTTP service bound to 127.0.0.1:3001. The Vite development proxy exposes it at /gateway on the control panel's origin. It is not deployed with the production frontend build. The server rejects unexpected host/origin values; all dashboard writes require the configured origin and authenticated session except the login handshake. Browser same-origin GET requests may omit Origin.
- A one-use, five-minute SIWE challenge authenticates the human wallet. Sessions last one hour, use HttpOnly SameSite cookies, and are hashed in the database. Agent credentials are also hashed; only creation returns the plaintext credential.
- SQLite stores operations, prepared payloads, approvals and audit events under ignored .local/gateway (directory0700, main database0600). Signed payloads are sensitive: the database is local credential-bearing state, not a public deployment artifact. Keys and signatures never enter model prompts or normal logs. The gateway holds no owner private key.
- The gateway checks current NFT ownership when creating or using agent connections and when preparing, approving or recovering a signed operation. Requests are scoped to agent, owner, account, chain and demo token. Human signatures bind the exact UserOperation through the existing NFT owner validator.
- Prepared quotes are reusable for at most five minutes. Competing requests for the same account are blocked while a fresh quote or an unresolved signed request holds its nonce. A conflicting quote is rejected rather than silently replacing the payload being reviewed. This is single-service coordination; production distributed submission remains milestone 2.
- A signed approval is distinct from submission and from payment success. The owner may recover the same signed payload through an owner-authenticated endpoint and resume submission; agent tools never receive it. If submission is ambiguous, attach its transaction hash for verification rather than creating another payment. The chain adapter verifies the matching UserOperationEvent before recording inclusion.
- The intent/quote deadline only controls this service's approval workflow. The currently deployed root validator does not encode an onchain deadline. A signed operation may remain executable until nonce/authority changes. Revoking an API key does not invalidate that signature or revoke the ERC-20 allowance.

## Evidence and current limits

The automated gateway smoke uses an actual MCP stdio client and HTTP service with temporary SQLite, real login/typed-data cryptography, and explicitly simulated chain adapters. It verifies tool discovery, proposal/idempotency, signed owner approval, signature privacy and revocation. No funds move in this smoke. Run `bun run smoke:gateway`.

Unit/integration tests cover challenge replay/expiry, session deletion, origin checks, account isolation, credential revocation, idempotency conflicts, approval preparation, expired quotes, signed recovery, persistence and receipt conflicts. The frontend and gateway pass TypeScript checks and production build. HTTP checks verify the local route and proxy. The new human approval UI has not been exercised through an injected browser wallet in this milestone. Existing Sepolia wallet tests/evidence are separate and do not prove the new end-to-end gateway flow onchain.

Receipt status is inclusion evidence, not finality or offchain delivery. A reorg-aware reconciler, automatic submission worker, richer provider delivery evidence, remote authentication/hosting, and autonomous session policies remain planned. A signed request with a stale nonce needs reconciliation; the app never silently changes and re-signs it. The SQLite database is a local service dependency, not a production multi-tenant deployment.
