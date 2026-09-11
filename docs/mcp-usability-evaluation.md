# Live MCP usability evaluation

On September 11, 2026, a GPT-5.6 Luna subagent with low reasoning effort tested the source MCP through `packages/agent-tools/scripts/verify-history.ts`. It received ordinary user questions and CLI tool-discovery instructions, without expected answers or access to source, credentials, or deployment evidence. Authentication was a disposable local fixture; blockchain and Graph data were live. This does not establish hosted gateway or published MCP package readiness.

## Questions

- What has my connected agent account paid recently, to whom, and how much?
- What happened in the payment transaction?
- Is that sufficient evidence that the merchant delivered the service?
- Have I paid anything on Arc or Base, or can we tell?
- Would you recommend paying the same merchant again based on this history alone?

## Observed result

The agent discovered the tools and invoked `get_account`, `list_payments`, `get_payment_context`, and `summarize_spending`. It identified the Sepolia transfer of 1 demo USDC (`1000000` base units) to `0x000000000000000000000000000000000000beef` in transaction `0xd92c635f38601d9b298ac2eeac192fe333e7b9be56894235d327d2977f78678f`. It correctly distinguished a successful UserOperation/token transfer from service delivery and declined to recommend another payment based only on this history.

Initially the agent queried the default chain and qualified its cross-chain conclusions. A follow-up asked it to explicitly query Arc Testnet (`5042002`) and Base Sepolia (`84532`). Both list and summary tools returned `coverage.status: not_configured`; the agent correctly interpreted this as missing coverage rather than zero spending. No proposal, signing, or execution tools were invoked.

The agent reported friction around raw base-unit amounts, Unix timestamps, raw merchant addresses, and the distinction between `complete` and `boundedResultComplete`. The context tool's separation of payment, settlement, and delivery evidence was useful. The first request encountered a sandbox DNS restriction; the same read-only request succeeded with network permission.

## Reproduce

Configure the local Graph environment using [deployment evidence](../deployments/subgraph-sepolia.json), then run from the repository root:

```sh
bun packages/agent-tools/scripts/verify-history.ts --list
bun packages/agent-tools/scripts/verify-history.ts --call list_payments '{"chainId":11155111}'
bun packages/agent-tools/scripts/verify-history.ts --call summarize_spending '{"chainId":5042002,"groupBy":"merchant"}'
```

The bridge only permits read-only tool calls. With no arguments it runs the deterministic live acceptance check.
