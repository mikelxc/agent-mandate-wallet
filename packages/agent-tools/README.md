# Wayleave MCP

`wayleave-mcp` is the stdio MCP adapter for the Wayleave gateway. MCP hosts can
run the published package without cloning the Wayleave repository.

## Connect an MCP host

Set `WAYLEAVE_AGENT_TOKEN` to the one-time agent key from the dashboard. Keep the value in the MCP host's environment; do not place it in source files, prompts, logs, or configuration committed to the repository.

Configure a compatible MCP host with the version-pinned package:

```json
{
  "mcpServers": {
    "wayleave": {
      "command": "bunx",
      "args": ["wayleave-mcp@0.1.0"],
      "env": {
        "WAYLEAVE_AGENT_TOKEN": "<one-time dashboard key>",
        "WAYLEAVE_GATEWAY_URL": "https://way-leave.vercel.app/gateway"
      }
    }
  }
}
```

Codex uses the equivalent TOML shape:

```toml
[mcp_servers.wayleave]
command = "bunx"
args = ["wayleave-mcp@0.1.0"]

[mcp_servers.wayleave.env]
WAYLEAVE_AGENT_TOKEN = "<one-time dashboard key>"
WAYLEAVE_GATEWAY_URL = "https://way-leave.vercel.app/gateway"
```

The equivalent npm runner command is `npx -y wayleave-mcp@0.1.0`. The dashboard
uses a fixed version instead of `latest` because the process receives a bearer
credential. It enables copying only after a fresh client-specific credential is
created.

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
