import { expect, test } from 'bun:test';
import { buildMcpConfig, type PackageManager } from './mcp-setup';
import { buildAgentSetupGuide } from './agent-setup-guide';
const base = { host: 'generic', credential: '<WAYLEAVE_AGENT_TOKEN>', gateway: 'https://www.wayleave.xyz/gateway', endpoint: 'https://www.wayleave.xyz/mcp' };
test('all launchers generate parseable client configurations and matching handoffs', () => {
  for (const manager of ['npm', 'bun'] as PackageManager[]) {
    const config = buildMcpConfig({ ...base, transport: 'local', manager });
    const server = JSON.parse(config).mcpServers.wayleave;
    const guide = buildAgentSetupGuide({ ...base, config, format: 'json', destination: 'Private settings', account: '', manager, transport: 'local' });
    expect(guide).toContain(server.command);
    expect(server.args).toContain('wayleave-mcp@0.1.3');
    const toml = buildMcpConfig({ ...base, host: 'codex', transport: 'local', manager });
    expect((Bun.TOML.parse(toml) as any).mcp_servers.wayleave.command).toBe(server.command);
  }
});
test('hosted setup has no local command and handoff explains manual setup', () => {
  const config = buildMcpConfig({ ...base, transport: 'hosted', manager: 'bun' });
  expect(JSON.parse(config).mcpServers.wayleave.command).toBeUndefined();
  expect(JSON.parse(config).mcpServers.wayleave.url).toBe(base.endpoint);
  const toml = buildMcpConfig({ ...base, host: 'codex', transport: 'hosted', manager: 'bun' });
  expect((Bun.TOML.parse(toml) as any).mcp_servers.wayleave.http_headers.Authorization).toBe('Bearer <WAYLEAVE_AGENT_TOKEN>');
  const guide = buildAgentSetupGuide({ ...base, config, format: 'json', destination: 'Private settings', account: '', transport: 'hosted' });
  expect(guide).toContain('No package install or terminal');
  expect(guide).toContain('exact manual steps');
  expect(guide).not.toContain('Install Bun');
});
