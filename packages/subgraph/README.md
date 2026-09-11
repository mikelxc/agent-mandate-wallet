# Wayleave indexed payment history

This package indexes the deployed Wayleave registry, demo token, and EntryPoint on Sepolia. Studio deployment `wayleave/v0.1.0` is live and verified; see [public deployment evidence](../../deployments/subgraph-sepolia.json). Three MCP history tools passed against live indexed data and Sepolia RPC through a disposable local gateway session. Hosted gateway configuration and decentralized-network publication remain separate steps. Arc Testnet's manifest is built but not deployed.

## Build and deploy

From the repository root:

```sh
bun install
bun run --cwd packages/subgraph codegen
bun run --cwd packages/subgraph build
```

Create a Sepolia subgraph in Graph Studio and use its deployment instructions with the locally installed Graph CLI (`bun x graph auth`, then `bun x graph deploy` from this package). Keep authentication tokens outside repository files. The manifest uses the existing deployment evidence in `deployments/wayleave-namespace-sepolia.json`, starting at account creation block **11658202**. This deliberately omits earlier factory activity. For wider backfill, verify the factory creation block and lower all source start blocks before redeploying. Generated code and build artifacts are ignored.

Configure the gateway server, never frontend variables:

```dotenv
WAYLEAVE_GRAPH_ENDPOINT=https://your-provider.example/subgraphs/id/your-subgraph
WAYLEAVE_GRAPH_DEPLOYMENT=actual-content-addressed-deployment-id-from-_meta
WAYLEAVE_GRAPH_CHAIN_ID=11155111
WAYLEAVE_GRAPH_START_BLOCK=11658202
WAYLEAVE_GRAPH_TOKEN=0x3c14067e0dbd276c083908c1d9d2f2dc0a65ca41
WAYLEAVE_GRAPH_API_KEY=server-only-provider-key-if-needed
```

The endpoint is operator configuration. Agents cannot choose it, submit raw GraphQL, change their account scope or obtain its credential. Redirects are rejected. A deployment ID mismatch, provider failure or malformed account scope returns unavailable coverage; no configured provider returns not_configured. The service supports separately configured per-chain providers through constructor injection; the environment factory currently configures one provider.

## What is indexed

- Registration: immutable initial NFAT account identity and owner. It is historical evidence, not the current authorization owner.
- Direct configured-token transfers involving a registered account, after registration.
- EntryPoint UserOperation success or failure for registered senders.
- Owner-funded token transfers inside successful UserOperation execution: the receipt segment begins after `BeforeExecution` or the preceding EntryPoint `UserOperationEvent`, and ends before this operation's event. This avoids attributing another bundled operation's transfers to the account. An absent boundary produces no inferred transfers.

IDs are `chainId:transactionHash:logIndex`. Graph Node rolls state back on reorg; the API exposes block hashes. Pagination sorts by these IDs, **not chronological order**. New events and reorgs can change pagination between requests; queries are not a permanent snapshot. Re-query a period when reconciling. Transfers before registration are not backfilled. An account-to-account transfer is assigned to the sender. This is not arbitrary-wallet history. Receipt-segment attribution can include other token effects produced by the operation; totals must not be described as confirmed purchases.

Cross-chain Circle events are not yet mapped. Burns/mints are excluded from outgoing summaries; their absence must not be interpreted as failure or zero spending. Destination settlement requires a verified Circle message correlation and destination receipt, and service delivery stays in the private gateway database.

## MCP and gateway

The gateway supplies fixed account-scoped `list_payments`, `get_payment_context`, and `summarize_spending` tools. `get_payment_context` accepts a transaction hash and optional chain; use existing `get_operation` for private operation state and fresh receipt evidence. The read-only dashboard history route reuses the same service. Date filters use inclusive Unix seconds. Lists allow 1–100 rows plus a continuation cursor. Summaries scan at most 100 rows, return exact base-unit sums and source event IDs, and flag truncation. `complete` remains false because scope and index lag prevent claiming complete spending; `boundedResultComplete` only describes the bounded query.

Example agent task: “List payments to this merchant this week, inspect the transaction's UserOperation outcome, and explain what is and isn't known before proposing another payment.” The agent must state missing coverage, indexing errors and the distinction between token effects and service delivery.

## Verification remaining

Codegen and WASM compilation validate the manifest and mapping types. Gateway tests exercise isolation, bounded queries, error/lag metadata, failed UserOperations and burn/mint exclusions. `bun run --cwd packages/subgraph test:mappings` executes five actual AssemblyScript event fixtures with pinned Matchstick 0.6.0: registration and pre-registration coverage, failed operations, bundled receipt boundaries, missing execution boundaries and unknown accounts. The CLI downloads the platform-specific Matchstick binary on first use; native macOS ARM64 execution was verified. These are mapping-runtime tests, not evidence of a live index.

After deploying and synchronizing, configure the server plus `WAYLEAVE_GRAPH_VERIFY_ACCOUNT` and `SEPOLIA_RPC_URL`, then run:

```sh
bun run --cwd packages/subgraph verify
```

This read-only check requires nonempty live results and reconciles up to ten indexed transfers with canonical RPC receipt logs. The first live check passed on September 11, 2026 for account `0xe4a1b73f7bd68c6f90f8508295515a590921aa3a`. Set `WAYLEAVE_GRAPH_VERIFY_ACCOUNT` to that account to reproduce it. Run `bun packages/agent-tools/scripts/verify-history.ts` from the repository root for the read-only stdio MCP check. It creates a disposable local authentication fixture, verifies actual current ownership via RPC, and invokes all three history tools against the live index. It sends no transactions and does not establish production login or hosted gateway readiness.

References: [Graph manifest](https://thegraph.com/docs/en/subgraphs/developing/creating/subgraph-manifest/), [supported networks](https://thegraph.com/docs/en/supported-networks/).
