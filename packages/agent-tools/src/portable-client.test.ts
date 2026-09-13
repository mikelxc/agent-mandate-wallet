import { test, expect } from 'bun:test';
import { createGatewayClient } from './client';
test('MCP uses only an owner-issued bearer and never requests authentication signatures', async () => {
  const calls: string[] = [];
  const client = createGatewayClient({ token: 'scoped-token', baseUrl: 'https://www.wayleave.xyz/gateway', fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer scoped-token');
    expect(new Headers(init?.headers).has('x-wayleave-account')).toBe(false);
    return Response.json({ chainId: 5042002, account: 'bound-account' });
  }) as typeof fetch });
  await Promise.all([client.getAccount(), client.getAccount()]);
  expect(calls).toEqual(['https://www.wayleave.xyz/gateway/agent/account', 'https://www.wayleave.xyz/gateway/agent/account']);
});
test('MCP does not renew or replay an expired bearer request', async () => {
  let calls = 0;
  const client = createGatewayClient({ token: 'expired', fetchImpl: (async (_url: string | URL | Request) => { calls++; return new Response(null, { status: 401 }); }) as typeof fetch });
  await expect(client.getAccount()).rejects.toThrow('401');
  expect(calls).toBe(1);
});
