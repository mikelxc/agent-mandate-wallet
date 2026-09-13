import { expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpHandler } from './http';

const origin = 'https://www.wayleave.xyz';
test('hosted MCP authenticates, discovers tools, isolates keys and respects revocation', async () => {
  const revoked = new Set<string>();
  const calls: string[] = [];
  const handler = createMcpHandler(async request => {
    const token = request.headers.get('authorization')!;
    if (!['Bearer alice', 'Bearer bob'].includes(token) || revoked.has(token)) return new Response(null, { status: 401 });
    calls.push(new URL(request.url).pathname);
    return Response.json({ account: token === 'Bearer alice' ? 'alice-account' : 'bob-account' });
  }, [origin]);
  const clients: Client[] = [];
  try {
    for (const token of ['alice', 'bob']) {
      const client = new Client({ name: token, version: '1' }); clients.push(client);
      await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
        fetch: (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => handler(new Request(String(url), init))) as typeof fetch,
      }));
      expect((await client.listTools()).tools.map(t => t.name)).toContain('propose_payment');
    }
    const results = await Promise.all(clients.map(client => client.callTool({ name: 'get_account' })));
    expect(JSON.stringify(results[0])).toContain('alice-account');
    expect(JSON.stringify(results[1])).toContain('bob-account');
    expect(calls.every(path => path === '/gateway/agent/account')).toBe(true);
    revoked.add('Bearer alice');
    await expect(clients[0].listTools()).rejects.toThrow();
    expect((await clients[1].listTools()).tools.length).toBeGreaterThan(0);
  } finally { await Promise.all(clients.map(client => client.close())); }
});

test('hosted MCP rejects missing keys and unexpected origins before gateway access', async () => {
  let calls = 0;
  const handler = createMcpHandler(async () => { calls++; return new Response(null); }, [origin]);
  expect((await handler(new Request(`${origin}/mcp`, { method: 'POST' }))).status).toBe(401);
  expect((await handler(new Request(`${origin}/mcp`, { method: 'POST', headers: { Origin: 'https://evil.example', Authorization: 'Bearer alice' } }))).status).toBe(403);
  expect((await handler(new Request('https://evil.example/mcp', { method: 'POST', headers: { Authorization: 'Bearer alice' } }))).status).toBe(403);
  expect((await handler(new Request(`${origin}/mcp`))).status).toBe(405);
  expect(calls).toBe(0);
});

test('hosted MCP binds the account through the bearer and rejects account-selector settings', async () => {
  let calls = 0;
  const handler = createMcpHandler(async () => { calls++; return Response.json({ account: 'token-bound-account' }); }, [origin]);
  const request = (headers: Record<string, string> = {}) => new Request(`${origin}/mcp`, { method: 'POST',
    headers: { Authorization: 'Bearer scoped-session', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_account' } }),
  });
  expect((await handler(request({ 'x-wayleave-account': `0x${'1'.repeat(40)}` }))).status).toBe(400);
  expect(calls).toBe(0);
  const response = await handler(request());
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('token-bound-account');
});
