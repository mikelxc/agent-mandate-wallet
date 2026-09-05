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
