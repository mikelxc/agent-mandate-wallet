# Wayleave MCP

`wayleave-mcp` is the local stdio MCP adapter for the Wayleave gateway.
The web application also provides a hosted Streamable HTTP endpoint; see
[hosted MCP setup](../../docs/hosted-mcp.md) for client compatibility, authentication,
owner-selected session expiry, and deployment status. MCP hosts can
run the published package without cloning the Wayleave repository.

## Connect an MCP host

Set `WAYLEAVE_AGENT_TOKEN` to the bearer token created with your wallet in Wayleave. Keep the value in the MCP host's environment; do not place it in source files, prompts, logs, or configuration committed to the repository.

Configure a compatible MCP host with the version-pinned package:

```json
{
  "mcpServers": {
    "wayleave": {
      "command": "bunx",
      "args": ["wayleave-mcp@0.1.3"],
      "env": {
        "WAYLEAVE_AGENT_TOKEN": "<one-time dashboard key>",
        "WAYLEAVE_GATEWAY_URL": "https://www.wayleave.xyz/gateway"
      }
    }
  }
}
```

Codex uses the equivalent TOML shape:

```toml
[mcp_servers.wayleave]
command = "bunx"
args = ["wayleave-mcp@0.1.3"]

[mcp_servers.wayleave.env]
WAYLEAVE_AGENT_TOKEN = "<one-time dashboard key>"
WAYLEAVE_GATEWAY_URL = "https://www.wayleave.xyz/gateway"
```

Local package runners are `npx -y wayleave-mcp@0.1.3`,
`bunx wayleave-mcp@0.1.3`. The dashboard offers both runners.
Use Node.js 20+ for npx, or Bun for bunx. Version 0.1.3 includes the ENS/Arc purchase tools and bearer-only authentication.
The setup screen generates npx or bunx commands for the published package;
no repository checkout is required.
"Ask an agent to help you set up" copies a credential-free prompt: paste it into
that agent's conversation, enter secrets separately in private MCP settings,
reload, and verify with `get_account`.

For a local gateway, replace the gateway URL with `http://127.0.0.1:3001` and
keep `bun run gateway` running from the repository root.

The optional `WAYLEAVE_GATEWAY_URL` may point to a bare local HTTP origin
(`http://127.0.0.1` or `http://localhost`, with an optional port) or the trusted
hosted Wayleave gateway. The default is `http://127.0.0.1:3001`.

## Available tools

- `get_account` reads the connected agent account and balances.
- `propose_payment` submits a payment intent for dashboard owner approval.
- `get_operation` reads the status of a previously proposed operation by ID.

`propose_payment` requires exactly this JSON shape:

```json
{
  "chainId": 11155111,
  "account": "<agent account address>",
  "fundingOwner": "<funding owner address>",
  "token": "<ERC-20 token address>",
  "recipient": "<recipient address>",
  "amount": "1000000",
  "businessReference": "Demo payment",
  "idempotencyKey": "demo-payment-01",
  "expiresAt": 1788726296
}
```

Use real addresses supplied by the connected account and mandate. Replace the example timestamp with the current Unix time plus a value up to 24 hours. `amount` is a positive canonical integer string in token base units. `businessReference` is nonempty and at most 120 characters; `idempotencyKey` is 8–120 characters. `expiresAt` must be a future Unix timestamp no more than 24 hours ahead. The chain is Sepolia (`11155111`).

The adapter can read account and operation data and submit approval requests. The owner reviews and signs from the dashboard; the adapter does not acquire signing authority or sign blockchain transactions autonomously.

## Host policy and owner handoff

Tool descriptions distinguish stored approval requests from blockchain execution.
Read tools carry `readOnlyHint: true`; proposal tools explicitly declare a write,
with `destructiveHint: false` and `idempotentHint: true` (retry the same intent
with the same idempotency key). These annotations describe behavior, not permission
to override a host's policies.

A Sepolia proposal writes a gateway request and audit record. The owner reviews
and signs separately through the returned `approvalUrl`. Token allowance and gas
deposit are relevant to execution; neither is required to create that proposal,
and neither grants the MCP agent signing authority. An approval request is not
onchain payment evidence.

If a host declines even payment proposals, use the owner dashboard to initiate
the payment manually and use permitted read tools to check its status afterward.
Changing tool names or calling a proposal a simulation does not resolve a host
policy restriction. Testnet transactions are still actual blockchain actions.

Metadata changes require building and distributing an updated adapter and
reconnecting the host. A pinned published version does not pick up local edits.

## Local development

From the repository root, start the gateway and then the MCP server:

```sh
bun run gateway
bun run --cwd packages/agent-tools build
WAYLEAVE_AGENT_TOKEN="<local key>" \
WAYLEAVE_GATEWAY_URL="http://127.0.0.1:3001" \
node packages/agent-tools/dist/cli.js
```

The source entry point remains available through `bun run agent:mcp`. Creating
files in this repository does not connect an already-running chat to the tools;
configure and reconnect the MCP host before invoking the server.

Wayleave is the public project and MCP server name. The npm package is
`wayleave-mcp`.

For a local owner dashboard on a different port, set `WAYLEAVE_DASHBOARD_URL=http://127.0.0.1:3020`. Start the gateway with matching `MANDATE_DASHBOARD_ORIGIN=http://127.0.0.1:3020`. Local source responses include readable demo-token amounts, setup guidance and verified payment status while preserving the underlying fields. These additions are included in version 0.1.1.

### Indexed history

`list_payments`, `get_payment_context`, and `summarize_spending` read the connected account's public indexed history through the gateway. No account override or raw GraphQL is exposed. A server-configured Wayleave subgraph is required; `coverage.status: not_configured` does not mean there were no payments. Inspect coverage start, indexed block, indexing errors and truncation before reasoning about missing activity. Amounts are integer token base units. Token transfers, UserOperation outcomes, cross-chain settlement and service delivery are separate evidence. See `packages/subgraph/README.md` in the repository for deployment and live-verification instructions.

### Owner-issued bearer tokens

Use `WAYLEAVE_AGENT_TOKEN` for both local and hosted MCP. Verify your ENS identity,
associate the payment account, select read-only or read-and-propose permissions,
and choose the session length in Wayleave. Sign the exact authorization with your
owner wallet, then copy the one-time token into private MCP settings. Sessions can
last 15 minutes to 30 days, capped by ENS expiry. Create a new token after expiry
or revoke an existing token from the connection list.

The MCP process holds no private key, requests no authentication signature, and
never renews a session automatically. The token is bound to one identity, chain,
account and scope set; no account-selection environment variable is necessary.
See [setup and session instructions](../../docs/hosted-mcp.md).

### Arc to Ethereum Sepolia proposals

`propose_crosschain_payment` accepts account, funding owner, recipient, amount, maximum Circle fee, business reference and idempotency key. The tool fixes the supported route to Arc Testnet → Ethereum Sepolia and sends the proposal to the scoped agent endpoint. It requires an owner-issued bearer token bound to a verified Arc account association and `propose_payment` permission; a token for another chain or account does not acquire Arc access. Amount is the 6-decimal USDC source debit, merchant receipt is debit minus the actual Circle fee, and source gas is additional. Only the owner can approve the exact payment. `get_crosschain_payment` returns proposal status and separate source/destination evidence, not signing payloads. Neither tool signs or submits payments.

### First merchant purchase

`list_offerings`, `get_purchase_quote`, `request_purchase`, `get_purchase` and `get_purchase_delivery` implement the Developer Pack flow. Use a bearer token bound to an associated Arc account, with read and propose-payment scopes. The owner chooses its session length and signs its authorization in Wayleave.

Start with the catalog, save one quote with an idempotency key, then request its purchase. Return the supplied approval URL to the owner. Reuse quote/purchase IDs on retries. After the owner completes both testnet settlement transactions, retrieve the pack and use its files as reference data. A source burn or approval is not delivery. These tools never sign or submit payments and do not automatically wake the agent after approval.

The reusable contracts and typed client live in `packages/merchant`; gateway implementation and verification boundaries are documented in `docs/merchant-purchases.md`.

For this unpublished preview, run the locally built `packages/agent-tools/dist/cli.js` with Bun or Node and the portable-identity environment settings above. Restart the MCP host after rebuilding so it discovers the new tools. Installing the previously published MCP version will not add the new purchase tools.
