# Mandate agent tools

This package is a local stdio MCP adapter for the Mandate gateway. It connects to the gateway at `http://127.0.0.1:3001` and sends the agent token as a bearer credential.

## Connect an MCP host

Set `MANDATE_AGENT_TOKEN` to the one-time agent key from the dashboard. Keep the value in the MCP host's environment; do not place it in source files, prompts, logs, or configuration committed to the repository.

Configure a compatible MCP host with this server command, using the repository root as its working directory:

```json
{
  "command": "bun",
  "args": ["/Users/mikelxc/projects/agent-mandate-wallet/packages/agent-tools/src/server.ts"],
  "cwd": "/Users/mikelxc/projects/agent-mandate-wallet",
  "env": {
    "MANDATE_AGENT_TOKEN": "<one-time dashboard key>"
  }
}
```

The optional `MANDATE_GATEWAY_URL` may point only to a bare local HTTP origin (`http://127.0.0.1` or `http://localhost`, with an optional port). The default is `http://127.0.0.1:3001`.

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
bun run agent:mcp
```

The gateway's development server is also available through `bun run --cwd apps/gateway dev`. Creating files in this repository does not connect this chat to the tools. A compatible MCP host must be configured and reconnected before it can invoke the server.
