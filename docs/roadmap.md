# Delivery plan

1. **Foundation (this commit):** Bun workspaces, Foundry factory/account/ENS adapter, generated SDK ABIs, wagmi connection, real create/grant UI, policy sandbox, automated checks.
2. **One complete local workflow:** Bun service with a durable operation ledger; agent receives structured payment tools; mock paid service delivers a report; distinguish paid-but-undelivered and retry delivery without paying again.
3. **Identity integration:** supply parent ENS name and verify live Sepolia registration/resolution, expiration and parent roles. Keep NFT ownership and name ownership from diverging.
4. **Arc / Circle:** verify current Agent Stack supports routing through the constrained account; deploy and make a real testnet-USDC service purchase. No ambient signer bypass.
5. **Ledger:** use device confirmation for mandate creation or exact one-off exceptions, after validating the supported Agent Stack/Key Ring API. Routine bounded payments need no device confirmation.
6. **Demo:** configure, pay, deliver, block malicious destination, reject replay, handle service failure, revoke. Optional ownership handover only after the primary flow is polished.

Sponsor eligibility, event deadlines, pre-existing-work disclosures and exact SDK/deployment versions must be reconfirmed before submission. This repository is an implementation starting point, not a claim that sponsor acceptance criteria are complete.
