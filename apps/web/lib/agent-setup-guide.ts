/** A shareable handoff: callers must supply a configuration with no credential. */
export function buildAgentSetupGuide(input: {
  host: string;
  destination: string;
  config: string;
  format: 'toml' | 'json';
  gateway: string;
  account: string;
}) {
  return `# Wayleave agent setup — ${input.host}

## Purpose and authority

Connect this agent to Wayleave on Sepolia (chain ID 11155111, test funds only).
The MCP can read the account, propose payments for owner review, and check operation status.
It cannot sign payments, change ownership, or grant token allowances. Never ask for an owner private key or seed phrase.

## Setup

1. Install Bun if it is unavailable, and ensure \`bunx\` is on the MCP host's PATH. If needed, configure the absolute path to bunx.
2. The owner opens Wayleave’s Connect an agent screen, connects and verifies their wallet, chooses or creates an agent wallet, and creates a separate connection for this client. Keys last 24 hours and can be revoked independently.
3. Obtain that connection key through private client settings. This document deliberately omits it. Do not overwrite an existing valid key with the placeholder, or put keys in chat, logs, source control, or shared documents.
4. ${input.destination}. Merge the server entry with existing configuration; preserve other servers. Generic MCP clients must support local stdio processes; this is not a remote HTTP MCP endpoint.
5. Replace <WAYLEAVE_AGENT_TOKEN> privately with the new key. The host launches the pinned package wayleave-mcp@0.1.1 using bunx; no repository checkout is required.

\`\`\`${input.format}
${input.config}
\`\`\`

Gateway: ${input.gateway}
${input.account ? `Expected agent wallet: ${input.account}` : 'Confirm the intended agent wallet with the owner before proposing payments.'}
${input.gateway.startsWith('http://127.0.0.1') ? '\nFor local development, keep `bun run gateway` running from the Wayleave repository on the same machine.' : ''}

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
