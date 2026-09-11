# Wayleave MCP: agent handoff

## Current state

Wayleave MCP installation and live gateway testing completed successfully on September 11, 2026 (UTC).

- Package: `wayleave-mcp@0.1.1`, launched using `bunx`.
- MCP server identity: `wayleave-agent-tools`, version `0.1.1`.
- Installed in this machine’s global Codex configuration: `~/.codex/config.toml`.
- Gateway: `https://way-leave.vercel.app/gateway`.
- Tests used a separate MCP client running the published package. Tool availability inside a new agent task still requires the host to load the configured server. Do not assume installation means the current task has the tools.
- No blockchain transaction was signed or executed during testing.

## Configuration

The token is already configured locally. It is intentionally omitted from this handoff. Do not replace the installed credential with this placeholder. For another machine or MCP host, provision its own credential through the dashboard.

```toml
[mcp_servers.wayleave]
command = "bunx"
args = ["wayleave-mcp@0.1.1"]

[mcp_servers.wayleave.env]
WAYLEAVE_AGENT_TOKEN = "<provision separately; never paste into a handoff>"
WAYLEAVE_GATEWAY_URL = "https://way-leave.vercel.app/gateway"
```

Use plain TOML: no escaped underscores or `@`, and no Markdown link syntax inside the URL value. Keep credentials out of source files, logs, frontend code, and shared documents.

## Verified features

| Feature | Observed result |
| --- | --- |
| MCP initialization and discovery | Successful; three tools exposed |
| `get_account` | Returned the connected agent, balances, permissions, and Sepolia chain ID |
| `propose_payment` | Created a payment request with status `approval_required` |
| `get_operation` | Retrieved the created request and confirmed its status |
| Idempotency | Repeating the identical proposal with the same key returned the same operation ID |
| Invalid payment input | Rejected an unsupported chain and missing required fields |
| Invalid operation input | Rejected an empty operation ID |
| Unknown operation | Returned a gateway 404 error |
| Recipient constraint | Rejected a recipient equal to the funding owner |

These are observed installation and gateway results, not proof of successful onchain payment execution or a comprehensive security audit.

## Connected account at test time

- Agent name: `Research assistant`
- Agent ID: `e846a560-f00e-4643-b4be-ea021cf88b5a`
- Permissions: `read`, `propose`
- Chain: Sepolia, `11155111`
- Agent account: `0xfe2a96590636f564e1150de9a831cd847ccff1df`
- Funding owner: `0x726f70dc5e89230248788421d939e3deedd83ffe`
- Demo token: `0x3c14067e0dbd276c083908c1d9d2f2dc0a65ca41`

Balances returned by the gateway, in base units:

```json
{
  "native": "4876472879787092196",
  "token": "100000000",
  "allowance": "0",
  "deposit": "0"
}
```

Treat this as a historical snapshot. Refresh `get_account` before relying on account state or balances. Do not infer token decimals from these values. The credential can expire or be revoked.

## Test proposal

- Operation ID: `d0445cc9-61dd-47d5-8947-6b4cc505867f`
- Last observed status: `approval_required`
- Recipient: the connected agent account above
- Amount: `1` token base unit
- Business reference: `MCP installation test - one base unit to agent account`
- Idempotency key: `mcp-installation-test-20260911-01`
- Expiry: Unix timestamp `1789087364` (15 minutes after proposal preparation)
- Dashboard: https://way-leave.vercel.app/?operation=d0445cc9-61dd-47d5-8947-6b4cc505867f

This request was left unsigned. Its status and expiry must be checked again before further use. Do not reuse this test key for a different intent.

## Instructions for the next agent

1. Discover whether `get_account`, `propose_payment`, and `get_operation` are available in your MCP host. If absent, load or reconnect the configured server; report the distinction between configured and callable.
2. Call `get_account` to verify current authentication, chain, account, and permissions.
3. Use `get_operation` with the test operation ID if its current status is relevant.
4. For a new user-authorized proposal, use current account data, the intended recipient, a fresh idempotency key, and a future expiry no more than 24 hours away. Amounts must be positive canonical integer strings in token base units. The recipient must differ from the funding owner.
5. Treat proposals as requests for owner approval. These tools do not grant autonomous signing authority. Creating a proposal is not payment execution.

## Repository working agreements

- Use Bun for package management, TypeScript scripts, and frontend tooling. Commit `bun.lock`; do not add npm, pnpm, or Yarn lockfiles.
- Smart contracts use Foundry. Synchronize generated ABIs with `bun run abi`.
- Run `bun run check` for changes spanning contracts and frontend. Use `bun run smoke` against Anvil for deployment or execution changes.
- Keep onchain evidence, gateway attestations, and UI simulations visibly distinct.
- Do not introduce unrestricted agent signing, arbitrary execution, or token approvals without revisiting the threat model.
- Do not claim ENS, Arc, or Ledger integrations are live based on mocks. Record deployment and verification evidence.
- Sepolia test deployments are authorized; keep deployment scripts guarded to chain `11155111`. Other public-chain deployments require explicit user authorization. Never put private keys in the frontend.
- Inspect the current working tree before edits and preserve existing user changes. This installation test did not modify application or contract source.

Relevant repository references: `packages/agent-tools/README.md`, `packages/agent-tools/src/server.ts`, `packages/agent-tools/src/client.ts`, `packages/protocol/src/index.ts`, and `AGENTS.md`.
