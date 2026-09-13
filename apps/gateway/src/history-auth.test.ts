import { expect, test } from 'bun:test';
import { createApp } from './app';
import { Store } from './store';
import { HistoryService } from './history';
import type { Chain } from './chain';

const account = '0x' + '1'.repeat(40), tx = '0x' + 'a'.repeat(64);
for (const chainId of [11155111, 5042002]) {
  test(`all history endpoints authenticate on the connection chain ${chainId}`, async () => {
    const store = new Store(':memory:');
    let queries = 0, valid = true, read = true;
    const history = new HistoryService([{ chainId, endpoint: 'https://graph.example/query', deployment: 'test', startBlock: 1, token: account }], (async (_url, init) => {
      queries++;
      const { variables } = JSON.parse(String(init?.body));
      expect(variables.account ?? variables.where.account).toBe(account);
      return Response.json({ data: { paymentTransfers: [], userOperations: [], _meta: { deployment: 'test', hasIndexingErrors: false, block: { number: 2, hash: tx } } } });
    }) as typeof fetch);
    const chain = { ownership: async () => { throw Error('Must use the already verified connection chain'); } } as unknown as Chain;
    const app = createApp(store, chain, { history, authenticateScopedAgent: async (_r, requiredChain) => {
      if (!valid || (requiredChain !== undefined && requiredChain !== chainId)) return null;
      return { id: 'test', name: 'test', owner: account, account, chainId, scopes: read ? ['read'] : [], expiresAt: 9999999999, revokedAt: null, createdAt: 1 };
    } });
    const get = (path: string) => app(new Request(`http://127.0.0.1:3001${path}`));
    try {
      for (const path of ['/agent/payments', '/agent/payments/summary', `/agent/payments/context?transactionHash=${tx}`]) {
        const response = await get(path);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.coverage.chainId).toBe(chainId);
        expect(body.coverage.status).toBe('indexed');
      }
      expect(queries).toBe(3);
      expect((await get(`/agent/payments?chainId=${chainId === 11155111 ? 5042002 : 11155111}`)).status).toBe(403);
      read = false;
      expect((await get('/agent/payments')).status).toBe(403);
      valid = false;
      expect((await get('/agent/payments')).status).toBe(401);
    } finally { store.close(); }
  });
}
