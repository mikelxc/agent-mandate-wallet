import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { Store } from './store';
import { createCompatibleAgentAuth } from './agent-auth';

const owner = '0x1111111111111111111111111111111111111111';
const token = 'a'.repeat(64);
const request = (method = 'GET') => new Request('https://www.wayleave.xyz/agent/account', { method, headers: { Authorization: `Bearer ${token}` } });
async function fixture() {
  const store = new Store(':memory:');
  const agent = await store.createAgent({ name: 'old-client', owner, account: owner, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: 2000 }, 1000);
  let time = 1001, controller = owner;
  const auth = createCompatibleAgentAuth(store, { ownership: async () => ({ owner: controller, epoch: '1', tokenId: '1' }) }, async () => null, () => time);
  return { store, agent, auth, expire: () => time = 2000, transfer: () => controller = '0x2222222222222222222222222222222222222222' };
}
test('existing connection works with scoped authentication enabled, for Sepolia only', async () => {
  const f = await fixture();
  try {
    expect((await f.auth(request()))?.id).toBe(f.agent.id);
    expect((await f.auth(request('POST'), 11155111))?.scopes).toEqual(['read', 'propose_payment']);
    expect(await f.auth(request(), 5042002)).toBeNull();
    const selected = request(); selected.headers.set('x-wayleave-account', owner);
    expect(await f.auth(selected)).toBeNull();
  } finally { f.store.close(); }
});
test('legacy fallback preserves expiry, revocation and live account ownership', async () => {
  for (const change of ['expire', 'revoke', 'transfer'] as const) {
    const f = await fixture();
    try {
      if (change === 'revoke') await f.store.revokeAgent(f.agent.id, owner, 1001);
      else f[change]();
      expect(await f.auth(request())).toBeNull();
    } finally { f.store.close(); }
  }
});
test('invalid scoped grant cannot fall back to its audit row', async () => {
  const f = await fixture();
  try {
    await f.store.db.query('UPDATE agents SET id=? WHERE id=?').run(`token_${f.agent.id}`, f.agent.id);
    expect(await f.auth(request())).toBeNull();
  } finally { f.store.close(); }
});
