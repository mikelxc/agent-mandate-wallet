# Wayleave

**Your intent. Your account. Your rules.**

Wayleave turns human intent into accountable onchain actions. It combines customizable smart accounts, NFT-based ownership, and an agent interface with a human approval dashboard. An agent requests a payment, the owner approves its exact terms, and both can inspect the transaction outcome.

This is the initial ETHOnline monorepo. It includes a working contract core and wallet-connected frontend, plus wallet-first guided onboarding. It is not yet the complete Circle/Ledger agent workflow.

The Sepolia wallet now uses pinned Kernel v4 with EntryPoint 0.9 and our NFT owner validator. It can spend demo ERC-20 tokens directly from the owner through a capped allowance. See [deployment evidence](docs/sepolia.md) and [current architecture](docs/kernel.md). The original OperatingAccount remains a reference for agent-policy behavior.

The new [passkey root factory](docs/passkey-accounts.md) supports deterministic Kernel accounts with self-owned identity NFTs and an account-owned ENS adapter. Contracts and SDK helpers are implemented; browser onboarding and a passkey Sepolia deployment are pending.

The default UI opens a dismissible walkthrough: **Wallet → Approval-only policy → Named account transaction → MCP client → NFAT selection → MCP connection → NFT interoperability**. Returning users see real accounts and payment requests, with no persistent simulated activity. The first transaction creates the NFAT and ENS name on Sepolia; it does not charge a name fee or approve token spending. Developer tools preserves the existing contract workflows. [Design decisions and Mobbin references](docs/plans/workspace-ux.md). Run the local UI regression suite with `bun run --cwd apps/web e2e:ui`; live sponsor execution is a separate E2E milestone.

Owner connection uses Reown AppKit with wagmi, supporting injected wallets and WalletConnect QR/mobile links. The public Reown project ID is configured in `apps/web/lib/wallet-config.ts`. Connecting does not authenticate the gateway: the owner explicitly verifies with the existing login signature afterward. AppKit loads in the browser so its SDK is not evaluated during server rendering.

## Stack

- **Bun 1.4.1** — workspace package manager, frontend tooling runtime, SDK tests and scripts.
- **Foundry 1.4.2 / Solidity 0.8.33** — contracts, deployment scripts and tests.
- **wagmi 3.7.7** — latest stable npm release checked during setup on September 5, 2026; pinned with the Bun lockfile.
- React 19, Next.js 16, TypeScript, viem, TanStack Query, shadcn primitives. Next.js development, builds, and local production serving run under Bun; Vercel functions use Node.js 24.
- OpenZeppelin 5.4.0; vendored forge-std v1.9.7.

## Workspace

```text
apps/web/                Human control panel, approval inbox, wallet connection
apps/gateway/            Local authenticated API and durable operation ledger
packages/protocol/       Shared payment intent schemas and validation
packages/agent-tools/    Local MCP adapter for scoped agent access
packages/contracts/     Foundry contracts, tests, local deployment
packages/sdk/           Generated contract ABIs, shared amount/policy helpers
scripts/                ABI generation and local integration smoke test
docs/                   Architecture, ENS setup and delivery plan
```

## Run

For the Vercel frontend build, linking, and gateway hosting requirements, see
[Vercel deployment](docs/vercel.md).

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

Connect an injected browser wallet to Anvil (chain 31337). Use an **Anvil development account only**. Enter the printed factory address in Reference contracts, create an account, and grant a mandate using the demo token address. Token funding and agent payment execution are demonstrated by `bun run smoke` and can also be performed using Foundry/viem. The Reference contracts tab supports this original payment-account workflow. The Sepolia wallet and Agent control tabs use the newer Kernel integration.

```sh
bun run check       # production build, types, SDK + contract tests
bun run smoke       # requires Anvil running; deploys isolated demo contracts
```

### Local browser E2E wallet

`bun run dev:e2e` enables an opt-in Wagmi connector for exercising the Sepolia UI with the ignored encrypted test keystore in `.secrets/`. The private key is never sent to or bundled into the browser. A loopback-only Next.js development launcher exposes a same-origin wallet endpoint only while this command is running; ordinary development and production builds do not enable it. The launcher refuses production mode and Vercel environments.

The endpoint is chain-locked to Sepolia and allowlists only this deployment's checked account creation, bounded demo-token mint/approval, fixed gas deposit, and validated single-payment UserOperation. The UI must register the complete UserOperation before its short-lived action hash can be signed. Treat the signer as a hot test key: never fund it with mainnet assets or reuse it for production authority.

Run the real browser regression explicitly—it spends Sepolia test gas:

```sh
bun run e2e:sepolia
```

The test creates and reloads an account through the UI, mints demo tokens, funds the EntryPoint deposit, submits and verifies a payment, and revokes the remaining allowance.

Anvil accounts are publicly known development accounts. Never fund them on a public network.

## Reference account implementation

- Factory doubles as the ERC-721 account ownership registry.
- One isolated payment account per token; onchain NFT metadata embeds its account address.
- Agent, token, recipient, per-payment limit, cumulative budget, expiry, revocation, ownership epoch, and account-wide request replay protection.
- Explicit propose/accept ownership handover; direct NFT transfers and operator approvals are disabled.
- Optional atomic ENSv2 subname registration adapter with immutable account address records.
- Generated ABIs used by the frontend; real wallet writes wait for successful receipts.
- Policy playground distinguishes payment success from service-delivery failure.

## Boundaries

The original OperatingAccount is a narrow policy reference. The deployed Sepolia wallet uses Kernel v4 and EntryPoint 0.9 with our NFT owner validator. The reference account's agent-policy limits do not automatically apply to Kernel root operations. This prototype does not claim complete ERC-7978 conformance.

The optional ENS adapter has unit tests against an ABI-compatible mock. Parent-name configuration, live registration, and resolver verification are tracked in [ENSv2 integration](docs/ens-v2.md); mock tests alone do not establish a live integration. Keep the parent namespace configurable as Wayleave identity support develops.

The local gateway persists agent requests, signed approvals, and verified inclusion receipts. Sepolia deployment and payment evidence are recorded in [the deployment guide](docs/sepolia.md). Autonomous agent policies, hosted bundling, reorg-aware reconciliation, paid-service delivery, Arc, Circle Agent Stack, and Ledger remain later milestones. This is unaudited prototype code; payment limits assume ordinary six-decimal stablecoins, not rebasing or fee-on-transfer assets.

See [architecture](docs/architecture.md), [ENSv2 integration](docs/ens-v2.md), and [delivery plan](docs/roadmap.md).

## Agent control panel

The first agent-access milestone is implemented locally. Run `bun run gateway` alongside `bun run dev`, then use the Agent control tab to sign in, issue a scoped connection key, and review requests. Every payment requires the owner's exact signature; autonomous session policies and hosted bundling are still pending. See [usage and boundaries](docs/agent-access.md) and [MCP setup](packages/agent-tools/README.md).

Run `bun run smoke:gateway` to test real MCP/HTTP communication with simulated chain data and no funds moving.

The public project and MCP server name is Wayleave. MCP hosts run the pinned
`wayleave-mcp` npm package with `bunx` or `npx`; setups use `WAYLEAVE_*`
environment variables. The onchain protocol keeps its mandate terminology and
existing deployed signature domains.
