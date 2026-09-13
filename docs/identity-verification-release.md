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
