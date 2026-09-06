# Mandate

Configurable operating accounts for agents: owner-controlled accounts, bounded payment authority, and explicit outcomes.

This is the initial ETHOnline monorepo. It includes a working contract core and wallet-connected frontend, plus a clearly labeled policy simulation. It is not yet the complete Circle/Ledger agent workflow.

The Sepolia wallet now uses pinned Kernel v4 with EntryPoint 0.9 and our NFT owner validator. It can spend demo ERC-20 tokens directly from the owner through a capped allowance. See [deployment evidence](docs/sepolia.md) and [current architecture](docs/kernel.md). The original OperatingAccount remains a reference for agent-policy behavior.

## Stack

- **Bun 1.4.1** — workspace package manager, frontend tooling runtime, SDK tests and scripts.
- **Foundry 1.4.2 / Solidity 0.8.33** — contracts, deployment scripts and tests.
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

### Local browser E2E wallet

`bun run dev:e2e` enables an opt-in Wagmi connector for exercising the Sepolia UI with the ignored encrypted test keystore in `.secrets/`. The private key is never sent to or bundled into the browser. The local Vite server exposes a same-origin wallet endpoint only while this command is running; ordinary development and production builds do not enable it.

The endpoint is chain-locked to Sepolia and allowlists only this deployment's checked account creation, bounded demo-token mint/approval, fixed gas deposit, and validated single-payment UserOperation. The UI must register the complete UserOperation before its short-lived action hash can be signed. Treat the signer as a hot test key: never fund it with mainnet assets or reuse it for production authority.

Run the real browser regression explicitly—it spends Sepolia test gas:

```sh
bun run e2e:sepolia
```

The test creates and reloads an account through the UI, mints demo tokens, funds the EntryPoint deposit, submits and verifies a payment, and revokes the remaining allowance.

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

## Agent control panel

The first agent-access milestone is implemented locally. Run `bun run gateway` alongside `bun run dev`, then use the Agent control tab to sign in, issue a scoped connection key, and review requests. Every payment requires the owner's exact signature; autonomous session policies and hosted bundling are still pending. See [usage and boundaries](docs/agent-access.md) and [MCP setup](packages/agent-tools/README.md).

Run `bun run smoke:gateway` to test real MCP/HTTP communication with simulated chain data and no funds moving.
