import { runners, type PackageManager, type McpTransport } from './mcp-setup';
/** A shareable handoff: callers must supply a configuration with no credential. */
export function buildAgentSetupGuide(input: {
  host: string;
  transport?: McpTransport;
  manager?: PackageManager;
  destination: string;
  config: string;
  format: 'toml' | 'json';
  gateway: string;
  account: string;
}) {
  const hosted = input.transport === 'hosted';
  const runner = runners[input.manager ?? 'npm'];
  return `# Wayleave agent setup — ${input.host}

Please help me configure Wayleave in ${input.host}. Use the settings below. If you cannot access my client settings, give me exact manual steps and stop short of claiming it is connected. Never ask me to paste the connection key into chat.

## Purpose and authority

Connect this agent to Wayleave on Sepolia (chain ID 11155111, test funds only).
The MCP can read the account, propose payments for owner review, and check operation status.
It cannot sign payments, change ownership, or grant token allowances. Never ask for an owner private key or seed phrase.

## Setup

1. ${hosted ? 'Use a Streamable HTTP MCP connection. No package install or terminal is required. Confirm the client supports a custom Authorization bearer header; OAuth-only connectors are not supported.' : `Confirm the client can launch local stdio commands. Use ${runner.command} (${input.manager ?? 'npm'}); Node.js 20+ is required for npx, or Bun for bunx. If commands are unavailable, ask the owner to select Hosted HTTP in Wayleave and copy a new prompt.`}
2. The owner opens Wayleave’s Connect agent screen, verifies their ENS identity with their wallet, and links the payment account. Choose a connection label, read-only or read-and-propose permissions, and a session length from 15 minutes to 30 days, then select Sign and create bearer token. Review the exact account, permissions and expiry in the wallet message. Tokens cannot outlast the ENS name and can be revoked independently.
3. Copy the newly issued bearer token into private client settings. This document deliberately omits it. Do not overwrite an existing valid key with the placeholder, or put keys in chat, logs, source control, or shared documents.
4. ${input.destination}. Merge the server entry with existing configuration; preserve other servers. ${hosted ? 'Enter the server URL and Authorization header in private connector settings.' : 'The client must support local stdio processes.'}
5. Replace <WAYLEAVE_AGENT_TOKEN> privately with the new key. ${hosted ? 'Use the remote URL as provided; never put the key in the URL.' : `The host launches the pinned package wayleave-mcp@0.1.3 using ${runner.command}; no repository checkout is required.`}

\`\`\`${input.format}
${input.config}
\`\`\`

Gateway: ${input.gateway}
${input.account ? `Expected agent wallet: ${input.account}` : 'Confirm the intended agent wallet with the owner before proposing payments.'}
${!hosted && input.gateway.startsWith('http://127.0.0.1') ? '\nFor local development, keep `bun run gateway` running from the Wayleave repository on the same machine.' : ''}

## Verify before use

Restart or reload the client's MCP servers. Discover get_account, propose_payment, and get_operation, then call get_account.
Verify the current account, Sepolia chain, and read/propose permissions against the owner's intended wallet. Stop on any mismatch.
Configuration alone does not establish a working connection. Report whether tools are configured, callable, or successfully authenticated.
If authentication fails, have the owner create a new connection and replace the expired or revoked key privately. Hidden keys cannot be retrieved from the dashboard.

## Payment workflow

Only propose payments requested by the user. Use current account data and the intended recipient; amounts are positive integer strings in token base units, so check token decimals first.
Use a fresh idempotency key for each new intent, reuse it only for an identical retry, and use a future expiry no more than 24 hours away.
Return the approval URL provided by propose_payment to the owner. The owner reviews and signs in Wayleave. Follow status with get_operation.
A proposal or gateway response is not proof of onchain payment execution. Keep gateway status, transaction evidence, and UI simulations distinct. Do not create a test payment merely to verify setup.
`;
}
