'use client';

import { useEffect, useState } from 'react';
import { Check, TerminalSquare, Cloud } from 'lucide-react';
import { mcpPackage, runners } from '../lib/mcp-setup';

export function PortableMcpSetup({
  identity,
  agentName,
  account,
  gateway,
  token,
  expiresAt,
}: {
  identity: string;
  agentName: string;
  account: string;
  gateway: string;
  token?: string;
  expiresAt?: number;
}) {
  const [host, setHost] = useState('codex');
  const [connection, setConnection] = useState<'npm' | 'bun' | 'hosted'>('npm');
  const method = connection === 'hosted' ? 'hosted' : 'local';
  const manager = connection === 'bun' ? 'bun' : 'npm';
  const [promptVisible, setPromptVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  useEffect(() => {
    setConfigCopied(false);
    setCopied(false);
  }, [host, method, manager, token]);
  const hosted = method === 'hosted';
  const endpoint = `${gateway.replace(/\/gateway\/?$/, '')}/mcp`;
  const env = {
    WAYLEAVE_GATEWAY_URL: gateway,
    WAYLEAVE_AGENT_TOKEN: token ?? '<WAYLEAVE_AGENT_TOKEN>',
  };
  const headers = {
    Authorization: `Bearer ${token ?? '<WAYLEAVE_AGENT_TOKEN>'}`,
  };
  const runner = runners[manager];
  const config =
    host === 'codex'
      ? hosted
        ? `[mcp_servers.wayleave]\nurl = ${JSON.stringify(endpoint)}\nhttp_headers = { ${Object.entries(
            headers,
          )
            .map(
              ([key, value]) =>
                `${JSON.stringify(key)} = ${JSON.stringify(value)}`,
            )
            .join(', ')} }`
        : `[mcp_servers.wayleave]\ncommand = ${JSON.stringify(runner.command)}\nargs = ${JSON.stringify(runner.args)}\n\n[mcp_servers.wayleave.env]\n${Object.entries(
            env,
          )
            .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
            .join('\n')}`
      : JSON.stringify(
          {
            mcpServers: {
              wayleave: hosted
                ? { url: endpoint, headers }
                : { ...runner, env },
            },
          },
          null,
          2,
        );
  const safeConfig = token
    ? config.replaceAll(token, '<WAYLEAVE_AGENT_TOKEN>')
    : config;
  const prompt = `Help me connect Wayleave to ${host}. ${hosted ? 'Use Streamable HTTP; no local process or package manager is needed in this chat client.' : `Use ${runner.command} to launch ${mcpPackage} from npm. No repository checkout or build is needed. Use Node.js 20+ for npx, or Bun for bunx.`}
My ENS identity is ${identity}, my connection label is ${agentName}, and my associated Arc Testnet account is ${account || '<confirm with owner>'}.
In Wayleave, verify the ENS identity with the owner's wallet and link the account. Choose a connection label, read-only or read-and-propose permissions, and session length (15 minutes, 1 hour, 24 hours, 7 days or 30 days). Click Sign and create bearer token; check the account, permissions and expiry in the wallet message before signing. This issues an API credential, not a payment. The token expires no later than the ENS name. No agent private key or onchain enrollment transaction is needed.
${hosted ? 'The client must support a remote URL and a custom Authorization bearer header. OAuth-only connectors are not supported.' : 'Set WAYLEAVE_AGENT_TOKEN in the local MCP environment. Do not configure an agent signing key.'}
Copy the token privately into the client settings, never into this chat, logs or source control. This prompt deliberately omits it. ${expiresAt ? `This connection expires at ${new Date(expiresAt * 1000).toISOString()}.` : 'Use the expiry shown when the token is created.'} Create a new token after expiry and revoke old tokens in Wayleave.
Configure the following in private ${host === 'codex' ? '~/.codex/config.toml' : 'MCP settings (adapt the example to your client)'}. Preserve other servers. If you cannot edit settings, give me exact manual steps; do not claim setup is complete.
${safeConfig}
Reload the client, discover tools and call get_account. Confirm identity, account, Arc Testnet, permissions and expiry. Do not propose a payment merely to test setup. Payment approval, onchain settlement and delivery are separate evidence.`;
  async function copyPrompt() {
    setPromptVisible(true);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="mcp-setup-options">
      <h3>Set up your MCP client</h3>
      <fieldset className="mcp-picker">
        <legend>Agent client</legend>
        <div className="agent-host-picker mcp-client-picker">
          {[
            { id: 'codex', name: 'Codex' },
            { id: 'claude', name: 'Claude' },
            { id: 'cursor', name: 'Cursor' },
            { id: 'generic', name: 'Other MCP' },
          ].map((client) => (
            <button
              type="button"
              key={client.id}
              aria-pressed={host === client.id}
              className={host === client.id ? 'selected' : ''}
              onClick={() => {
                setHost(client.id);
                setCopied(false);
              }}
            >
              <span className="agent-host-logo">
                <img
                  src={`/agent-logos/${client.id}.svg`}
                  alt=""
                  width={28}
                  height={28}
                />
              </span>
              <strong>{client.name}</strong>
              {host === client.id && <Check size={14} />}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="mcp-picker">
        <legend>Run with</legend>
        <div className="agent-host-picker mcp-runner-picker">
          {[
            {
              id: 'npm' as const,
              title: 'npx',
              detail: 'Node.js',
              icon: TerminalSquare,
            },
            {
              id: 'bun' as const,
              title: 'bunx',
              detail: 'Bun',
              icon: TerminalSquare,
            },
            {
              id: 'hosted' as const,
              title: 'Hosted HTTP',
              detail: 'No install',
              icon: Cloud,
            },
          ].map((choice) => (
            <button
              type="button"
              key={choice.id}
              aria-pressed={connection === choice.id}
              className={connection === choice.id ? 'selected' : ''}
              onClick={() => {
                setConnection(choice.id);
                setCopied(false);
              }}
            >
              <span className="agent-host-logo">
                <choice.icon size={24} />
              </span>
              <strong>{choice.title}</strong>
              <small>{choice.detail}</small>
              {connection === choice.id && <Check size={14} />}
            </button>
          ))}
        </div>
      </fieldset>
      <p>
        {hosted
          ? 'Use a client that supports Streamable HTTP with a custom bearer header. No package manager is needed in the chat interface. OAuth-only connectors are not supported.'
          : 'Use Node.js 20+ with npx, or Bun with bunx. Your client runs the published Wayleave package; no checkout or build is needed.'}
      </p>
      <p>
        Create a bearer token above by signing with your wallet. The same token
        works locally or over HTTP. It is bound to one account and permission
        set, and lasts for the session length you chose.
      </p>
      <details>
        <summary>Show MCP settings</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {config}
        </pre>
        <button
          type="button"
          disabled={!token}
          onClick={() =>
            void navigator.clipboard
              .writeText(config)
              .then(() => setConfigCopied(true))
              .catch(() => setConfigCopied(false))
          }
        >
          {configCopied
            ? 'Copied private settings'
            : 'Copy private MCP settings'}
        </button>
        <p>
          {host === 'codex'
            ? 'Merge into your private ~/.codex/config.toml.'
            : 'Open your client’s MCP settings and adapt this configuration to its format.'}{' '}
          Replace placeholders privately, reload the client, then call
          get_account.
        </p>
      </details>
      <details>
        <summary>Ask an agent to help you set up</summary>
        <ol>
          <li>
            Choose your client, connection method and package manager above.
          </li>
          <li>
            Copy this prompt and paste it into a conversation with that agent.
          </li>
          <li>
            Choose the session length in Wayleave, sign with your wallet, and
            enter the bearer token only in private client settings.
          </li>
          <li>
            Reload the client and ask it to call get_account to verify your
            wallet.
          </li>
        </ol>
        <button type="button" onClick={() => void copyPrompt()}>
          {copied ? 'Copied setup prompt' : 'Copy setup prompt'}
        </button>
        {promptVisible && (
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {prompt}
          </pre>
        )}
      </details>
    </div>
  );
}
