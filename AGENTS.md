# Working agreements

- Deploy the website only by pushing committed changes to `origin/main` and letting the Git-connected production pipeline deploy that commit. Never deploy from a local checkout or temporary directory, and never run direct deployment commands such as `vercel deploy` or `vercel --prod`. Local development and builds are fine; production releases must come from `origin/main`.
- Use Bun for package management, TypeScript scripts, and frontend tooling. Commit bun.lock; do not add npm/pnpm/yarn lockfiles.
- Smart contracts use Foundry. Keep generated ABIs synchronized with `bun run abi`.
- Run `bun run check` for changes spanning contracts and frontend. Use `bun run smoke` against Anvil for deployment/execution changes.
- Keep onchain evidence, gateway attestations and UI simulations visibly distinct.
- Never introduce unrestricted agent signing, arbitrary execution, or token approvals without revisiting the threat model.
- Never claim ENS/Arc/Ledger integrations are live based on mocks. Record the deployment and verification evidence.
- Sepolia test deployments are authorized by the user. Keep deployment scripts chain-guarded to 11155111; other public-chain deployments require explicit user authorization. Never add private keys to the frontend.
