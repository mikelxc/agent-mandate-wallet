export type PackageManager = 'npm' | 'bun';
export type McpTransport = 'local' | 'hosted';
export const mcpPackage = 'wayleave-mcp@0.1.3';
export const runners = {
  npm: { command: 'npx', args: ['-y', mcpPackage] },
  bun: { command: 'bunx', args: [mcpPackage] },
};
export function buildMcpConfig(input: {
  host: string;
  transport: McpTransport;
  manager: PackageManager;
  credential: string;
  gateway: string;
  endpoint: string;
}) {
  const { host, transport, manager, credential, gateway, endpoint } = input;
  const runner = runners[manager];
  if (host === 'codex')
    return transport === 'hosted'
      ? `[mcp_servers.wayleave]\nurl = ${JSON.stringify(endpoint)}\nhttp_headers = { Authorization = ${JSON.stringify(`Bearer ${credential}`)} }`
      : `[mcp_servers.wayleave]\ncommand = ${JSON.stringify(runner.command)}\nargs = ${JSON.stringify(runner.args)}\n\n[mcp_servers.wayleave.env]\nWAYLEAVE_AGENT_TOKEN = ${JSON.stringify(credential)}\nWAYLEAVE_GATEWAY_URL = ${JSON.stringify(gateway)}`;
  return JSON.stringify(
    {
      mcpServers: {
        wayleave:
          transport === 'hosted'
            ? {
                url: endpoint,
                headers: { Authorization: `Bearer ${credential}` },
              }
            : {
                ...runner,
                env: {
                  WAYLEAVE_AGENT_TOKEN: credential,
                  WAYLEAVE_GATEWAY_URL: gateway,
                },
              },
      },
    },
    null,
    2,
  );
}
