# Working agreements

- Use Bun for package management, TypeScript scripts, and frontend tooling. Commit bun.lock; do not add npm/pnpm/yarn lockfiles.
- Smart contracts use Foundry. Keep generated ABIs synchronized with `bun run abi`.
- Run `bun run check` for changes spanning contracts and frontend. Use `bun run smoke` against Anvil for deployment/execution changes.
- Keep onchain evidence, gateway attestations and UI simulations visibly distinct.
- Never introduce unrestricted agent signing, arbitrary execution, or token approvals without revisiting the threat model.
- Never claim ENS/Arc/Ledger integrations are live based on mocks. Record the deployment and verification evidence.
- Do not deploy public-chain contracts or add private keys to the frontend.
