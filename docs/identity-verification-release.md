# Identity verification release — September 13, 2026

Production deployment `dpl_E2hv4ABHr53cvaKoJXAMMf9S2Q5h` is Ready and aliased to https://www.wayleave.xyz. Inspection: https://vercel.com/lxc-xyz/wayleave/E2hv4ABHr53cvaKoJXAMMf9S2Q5h.

The isolated release preserves commit `b94430a` and adds the identity resolver, SDK authority metadata, verification UI and documented authority boundary. Other uncommitted workspace changes were excluded. No contracts were changed or deployed.

The previous live discovery response for `research-desk.wayleave.eth` reported the naming adapter `0x03AEcb257c931A5eB18F18cCAD9f6d9B584ad44b` as the authentication controller. The adapter has no signature verification implementation. After release, public discovery reports NFT owner `0x96B0D15128748cE191B79c75560Ed93695788865` while separately retaining that adapter as `authority.registryOwner`, account `0x2f86Ce1feCa9b2B722Bab2b402c9fA24F613b60A`, token 1 and epoch 1. This was verified through the live gateway and independent read-only Sepolia discovery. It establishes the naming/NFT association, not a successful signature by that owner's wallet.

Validation:

- 26 focused gateway tests passed, covering direct ENS ownership, pinned adapter authority, mismatched bindings, wrong signatures, ownership handover/epoch invalidation, sessions, account association and bearer tokens.
- Isolated workspace type checks and Vercel's production build passed.
- Two browser regressions passed locally and against the deployed frontend: identity signing switches from Arc to Sepolia, and a different NFT owner is rejected before signing. These browser tests use disposable injected wallets and intercepted gateway responses backed by the real identity authentication handler, not the user's wallet or live ownership registry.
- Live gateway health returned HTTP 200, `ok: true`, chain 11155111 and `human_approval` mode.

The owner must retry the real wallet signature in step 5. No user key, public-chain transaction, allowance or payment was used for this release.

## Token button follow-up

The token creation button silently disabled itself for an invalid/missing Arc account or connection label. It now remains clickable when idle and explains the exact field to correct before any gateway challenge or wallet signature. Surrounding whitespace is trimmed, and the ENS expiry note now describes the expiry cap without presenting it as a failure. Signature and gateway authorization checks are unchanged.

The isolated release uses committed base `472b550` plus this component fix. The concurrent account-picker changes in the workspace are excluded. Frontend TypeScript and two browser regressions passed, including clickable missing-account and invalid-label guidance with no extra signature. Production release verification follows below.

Published production deployment `dpl_G7A9MYHJKBa94c6hyBXmLq2eWtZG` (Ready), aliased to https://www.wayleave.xyz. Vercel build and TypeScript checks passed. Both browser regressions passed again against the live frontend with disposable injected wallets and intercepted gateway responses; no user-wallet signature or public-chain transaction was requested.

## Guided step 5 — completed fields

The guided connection flow now disables the ENS name and Arc account inherited from earlier steps. Connection label, duration and permissions remain editable before issuance; after issuance they are disabled in a collapsed signed-settings disclosure. MCP client setup appears only after token creation, and the connection list is collapsed in guided mode. Standalone connection management retains its editable account choice.

A local-only staged harness exercised the actual PortableIdentityPanel and AgentTokenManager through identity verification, Arc association and token issuance, using disposable wallet signatures and intercepted gateway responses backed by real identity/association/token handlers. It verified all inherited fields disabled, no premature MCP controls, editable pre-sign settings, locked post-sign settings, and exactly three signatures for the three distinct proofs. The harness was removed from the deployable app before release. Frontend TypeScript passed. This UI test is not evidence of a user-wallet signature or live payment.

Published as production deployment `dpl_GpxgRTKFGsHhp2MiaD7fmiKurRfM` (Ready), aliased to https://www.wayleave.xyz. Vercel production compilation and TypeScript validation passed. No local test harness route was included in the production route list.
