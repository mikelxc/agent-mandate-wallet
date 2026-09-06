# Verification

Initial local checks, September 5, 2026:

- Production frontend build with Bun/Vinext.
- TypeScript check of the frontend and imported SDK.
- 21 Foundry tests, including 256 fuzz cases for payment conservation.
- Six Bun SDK tests.
- Anvil integration script: deployment, creation, funding, grant, payment, duplicate rejection, ownership handover and stale-grant rejection.
- Local frontend route returned HTTP 200. No browser interaction or visual QA was requested/performed.

The optional read-only WebMCP policy-preview tool is feature-detected. A supported WebMCP validation context was not available, so browser tool registration is unverified. The normal UI is independent of this API.

ENS tests use a mock registry; live registration and Universal Resolver behavior remain unverified. No Circle, Arc or Ledger deployment/integration is claimed. CI is included; its remote result should be checked after push.

## Kernel / owner-balance milestone

- Production build and TypeScript check passed after adding the Sepolia workspace.
- 32 Foundry tests passed, including 11 tests against real local Kernel v4 and EntryPoint 0.9 implementations. These cover owner-balance payment, cumulative token allowance, revocation, exact wrong-signature/nonce errors, ownership-epoch invalidation, deterministic deployment, wallet batching, stale predictions, and the documented standing-allowance survival after NFT transfer.
- Nine Bun SDK tests passed, including setup-call encoding, exact transferFrom encoding, and authorization domain separation.
- The reference Anvil deployment smoke still passes. The Kernel deployment and signed owner-balance transfer were additionally executed on Sepolia; see deployments/sepolia.json and deployments/sepolia-smoke.json.
- The updated local frontend returned HTTP 200. Injected-wallet interaction, EIP-5792 batch submission, ERC-1271 owners, third-party policy modules, and visual QA remain unverified.
- The demo allowance was independently read back as zero after the smoke test. The account retains its remaining gas deposit.

## Agent request and approval milestone

See [agent access](agent-access.md) for the implementation and limits. New checks cover the durable service, authentication/isolation, signed recovery, and the actual MCP transport against a simulated chain adapter. These are distinct from the existing public Sepolia payment evidence. The new approval UI has not been browser-wallet-tested in this milestone.
