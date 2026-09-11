# Subgraph integration for agent payment history

Status: planned, September 11, 2026. This document describes intended behavior; it does not establish a live Graph deployment.

## Outcome

An agent can ask what an NFAT account spent, explain a payment's execution history, and reconcile cross-chain settlement through the existing MCP interface. The owner sees the same evidence in Wayleave. Historical context helps the agent decide whether to propose another payment or investigate an existing one.

This work complements [Arc and Circle payments](arc-circle-payments.md) and [portable ENSv2 identity](ensv2-portable-identity.md). Begin with existing Sepolia activity; extend the same model to verified Arc and destination-chain deployments.

## Current foundation

`packages/agent-tools` exposes `get_account`, `propose_payment`, and `get_operation`. The gateway stores private operation records and verifies chain receipts. There is no general MCP history interface or live Wayleave subgraph evidenced by this plan.

## Implementation sequence

1. Verify a live Graph provider can index and serve the exact target networks. Record provider, network identifier, endpoint, deployment ID and indexed block. A general Arc support listing is not proof of Arc Testnet availability. If unavailable, deliver Sepolia history first and report the Arc coverage gap explicitly.
2. Add a versioned subgraph schema and event mappings for NFAT/account registration, relevant USDC transfers, and EntryPoint UserOperation outcomes. Add Circle burn/mint events once that execution path exists. Define deployment start blocks and backfill behavior, including transfers before account registration. Avoid promising complete arbitrary-wallet history.
3. Add typed gateway queries with account authorization, bounded pagination, date ranges and supported chain filters. Keep provider credentials server-side and constrain query complexity; do not expose arbitrary upstream URLs or unrestricted GraphQL through the agent tools.
4. Extend MCP with the tools below and return structured source references. Reuse the gateway query service for UI history so the two surfaces agree.
5. Demonstrate an agent using the results to explain a failed operation or answer whether a merchant payment settled before proposing a new purchase.

| Proposed tool | Inputs | Result |
| --- | --- | --- |
| `list_payments` | Authorized account, chain filter, period, cursor | Paginated indexed payment activity and coverage |
| `get_payment_context` | Operation ID or supported chain/payment identifier | Correlated execution events, settlement evidence and permitted private context |
| `summarize_spending` | Authorized account, period, merchant/chain grouping | Deterministic totals with underlying event references and completeness indicators |

## Data and evidence model

- Identify events by chain, transaction hash and log index. Preserve block number/hash and indexing provenance. Handle reorgs without permanently double-counting removed events.
- Distinguish the outer transaction result from `UserOperationEvent.success` and actual token effects. An outer success alone is not a successful payment.
- For cross-chain payments, join source and destination evidence by verified protocol message/transfer identifiers. Do not correlate solely by amount, recipient or timestamp. Compose separate chain indexes in the gateway.
- Separate merchant amount, fees, source debit and destination credit. Never count a burn and its corresponding mint as two purchases.
- Return indexed block, coverage start, timestamp and indexing-error status. Distinguish no matching events from missing coverage or an unavailable index.
- Keep fresh balances, allowance checks and immediate receipt verification on RPC. Historical indexed data does not authorize spending or prove a pending payment failed.
- Retain private proposals, rejected requests, credentials and delivery records in the gateway. Publish only public-chain facts in the subgraph; join private context after access checks.

## Verification and completion

Use Bun for tooling and scripts. Test mappings against representative registration, transfer, failed UserOperation and cross-chain events. Test gateway account isolation, pagination, lag/error reporting and double-count prevention. Exercise the MCP tools through an actual client against a live Graph endpoint and reconcile sample results against RPC receipts.

Completion requires a reproducible deployment, documented query coverage, an agent answering useful questions from live results, and a UI/API distinction between indexed history, chain verification and service delivery. A local mock or raw query dump is insufficient evidence of the intended integration.

## References

- [Subgraph MCP](https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/)
- [Supported networks](https://thegraph.com/docs/en/supported-networks/)
- [Deploying across networks](https://thegraph.com/docs/en/subgraphs/developing/deploying-publishing/multiple-networks/)
- [Current agent access](../agent-access.md)
