# Mandate

Configurable operating accounts for agents: owner-controlled accounts, bounded payment authority, and explicit outcomes.

This is the initial ETHOnline monorepo. It includes a working contract core and wallet-connected frontend, plus a clearly labeled policy simulation. It is not yet the complete Circle/Ledger agent workflow.

## Stack

- **Bun 1.4.1** — workspace package manager, frontend tooling runtime, SDK tests and scripts.
- **Foundry 1.4.2 / Solidity 0.8.30** — contracts, deployment scripts and tests.
- **wagmi 3.7.7** — latest stable npm release checked during setup on September 5, 2026; pinned with the Bun lockfile.
- React 19, TypeScript, viem, TanStack Query, Vinext/Vite, shadcn primitives.
- OpenZeppelin 5.4.0; vendored forge-std v1.9.7.

## Workspace

```text
apps/web/                Configuration UI, policy playground, wallet connection
packages/contracts/     Foundry contracts, tests, local deployment
packages/sdk/           Generated contract ABIs, shared amount/policy helpers
scripts/                ABI generation and local integration smoke test
docs/                   Architecture, ENS setup and delivery plan
```

## Run

Install Bun and Foundry, then:

```sh
bun install --frozen-lockfile
bun run contracts:build
bun run abi
bun run dev
```

Open the local URL printed by the server. The policy playground works without a wallet and never moves funds.

For actual contract interaction, in separate terminals:

```sh
bun run chain
bun run deploy:local
```

Connect an injected browser wallet to Anvil (chain 31337). Use an **Anvil development account only**. Enter the printed factory address in Contract workspace, create an account, and grant a mandate using the demo token address. Token funding and agent payment execution are demonstrated by `bun run smoke` and can also be performed using Foundry/viem. The UI currently supports account creation and mandate creation; it does not yet expose every contract function.

```sh
bun run check       # production build, types, SDK + contract tests
bun run smoke       # requires Anvil running; deploys isolated demo contracts
```

Anvil accounts are publicly known development accounts. Never fund them on a public network.

## Implemented

- Factory doubles as the ERC-721 account ownership registry.
- One isolated payment account per token; onchain NFT metadata embeds its account address.
- Agent, token, recipient, per-payment limit, cumulative budget, expiry, revocation, ownership epoch, and account-wide request replay protection.
- Explicit propose/accept ownership handover; direct NFT transfers and operator approvals are disabled.
- Optional atomic ENSv2 subname registration adapter with immutable account address records.
- Generated ABIs used by the frontend; real wallet writes wait for successful receipts.
- Policy playground distinguishes payment success from service-delivery failure.

## Boundaries

The payment account is deliberately narrow and is **not an ERC-4337/7579 implementation or a complete ERC-7978 conformance claim**. Its ownership and policy interfaces establish a first product slice; a modular smart-account implementation can replace it after the execution guarantees are tested.

The ENS adapter has unit tests against an ABI-compatible mock. Live ENSv2 registration and Universal Resolver compatibility must be verified against the current beta deployment before claiming a sponsor integration. An actual parent name and registry permissions are required. Local deployment disables ENS explicitly; it does not mint fake ENS names.

Arc, Circle Agent Stack, Ledger, service delivery, reconciliation persistence, and onchain approval escalation are next milestones. No public-chain deployment or paid service integration is included yet. This is unaudited prototype code; payment limits assume ordinary six-decimal stablecoins, not rebasing or fee-on-transfer assets.

See [architecture](docs/architecture.md), [ENSv2 integration](docs/ens-v2.md), and [delivery plan](docs/roadmap.md).
