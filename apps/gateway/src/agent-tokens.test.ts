import { test, expect } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage, zeroAddress } from 'viem';
import { agentTokenMessage, identityFingerprint, portableIdentityDeployment, type PortableIdentity, type AgentTokenScope } from '@mandate/sdk';
import { Store } from './store';
import { createIdentityAuth, createIdentityRoutes } from './identity-auth';
import { createIdentityAssociations } from './identity-associations';
import { createAgentTokens } from './agent-tokens';

const owner = privateKeyToAccount(`0x${'11'.repeat(32)}`), payment = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const origin = 'https://www.wayleave.xyz';
async function fixture() {
  const store = new Store(':memory:');
  let time = 1000, epoch = '1';
  const identity: PortableIdentity = { name: 'desk.eth', deployment: portableIdentityDeployment, chainId: 11155111, registry: owner.address, controller: owner.address,
    resolver: zeroAddress, subregistry: zeroAddress, registration: identityFingerprint('v1'), expiresAt: 9999999, canSetSubregistry: false };
  const auth = createIdentityAuth({ db: store.db, audience: origin, now: () => time, resolver: {
    discover: async () => structuredClone(identity), membership: async () => { throw new Error('No agent registry or private key is used'); },
    verify: (address, message, signature) => verifyMessage({ address, message, signature }),
  } });
  async function login() { const challenge = await auth.challenge({ deployment: portableIdentityDeployment, kind: 'owner', name: identity.name }); return (await auth.verify(challenge.proof.nonce, await owner.signMessage({ message: challenge.message }))).token; }
  const ownerToken = await login();
  const associations = createIdentityAssociations(store.db, auth, {
    ownership: async () => ({ controller: payment.address, epoch }),
    verify: async (_chain, controller, message, signature) => verifyMessage({ address: controller, message, signature }),
  }, () => time);
  const c = await associations.challenge(ownerToken, 5042002, payment.address);
  await associations.attach(ownerToken, c.binding.nonce, await payment.signMessage({ message: c.message }));
  const tokens = createAgentTokens(store, auth, associations, origin, () => time);
  const input = { name: 'assistant', chainId: 5042002, account: payment.address, scopes: ['read', 'propose_payment'] as AgentTokenScope[], durationSeconds: 86400 };
  async function issue(changes: Partial<typeof input> = {}) {
    const challenge = await tokens.challenge(ownerToken, { ...input, ...changes });
    const signature = await owner.signMessage({ message: challenge.message });
    return { challenge, signature, ...await tokens.issue(ownerToken, challenge.grant.nonce, signature) };
  }
  const request = (token: string, method = 'GET', account?: string) => new Request(`${origin}/agent/account`, { method, headers: { Authorization: `Bearer ${token}`, ...(account ? { 'x-wayleave-account': account } : {}) } });
  return { store, auth, associations, tokens, input, issue, ownerToken, identity, request, login, setTime: (value: number) => time = value, changeEpoch: () => { epoch = '2'; } };
}

test('owner-signed bearer preserves chosen expiry, persists, and needs no child registry', async () => {
  const s = await fixture();
  try {
    const issued = await s.issue();
    expect(issued.connection.expiresAt).toBe(87400);
    expect(issued.challenge.grant.durationSeconds).toBe(86400);
    const another = createAgentTokens(s.store, s.auth, s.associations, origin, () => 1000);
    const agent = await another.authenticate(s.request(issued.token));
    expect(agent?.chainId).toBe(5042002);
    expect(agent?.account.toLowerCase()).toBe(payment.address.toLowerCase());
    expect(agent?.scopes).toEqual(['read', 'propose_payment']);
    const row = await s.store.db.query('SELECT tokenHash FROM agents WHERE id=?').get(issued.connection.id) as { tokenHash: string };
    expect(row.tokenHash).toBe(`bearer:${issued.connection.id}`);
    expect(JSON.stringify(await s.tokens.list(s.ownerToken))).not.toContain(issued.token);
    expect(JSON.stringify(await s.store.db.query('SELECT * FROM agent_tokens').all())).not.toContain(issued.token);
    // Owner login expiry must not shorten the independently signed agent grant.
    s.setTime(2000);
    expect(await s.tokens.authenticate(s.request(issued.token))).not.toBeNull();
    s.setTime(87400);
    expect(await s.tokens.authenticate(s.request(issued.token))).toBeNull();
  } finally { s.store.close(); }
});

test('session duration is bounded, signed, capped to ENS expiry and cannot be extended by replay', async () => {
  const s = await fixture();
  try {
    for (const durationSeconds of [0, 899, 2592001, 1.5, NaN, '86400' as unknown as number])
      await expect(s.tokens.challenge(s.ownerToken, { ...s.input, durationSeconds })).rejects.toThrow('Session length');
    for (const durationSeconds of [900, 3600, 86400, 604800, 2592000]) {
      const result = await s.issue({ durationSeconds });
      expect(result.connection.expiresAt).toBe(1000 + durationSeconds);
    }
    const c = await s.tokens.challenge(s.ownerToken, s.input);
    const changed = { ...c.grant, durationSeconds: 2592000, tokenExpiresAt: 2593000 };
    await expect(s.tokens.issue(s.ownerToken, c.grant.nonce, await owner.signMessage({ message: agentTokenMessage(changed) }))).rejects.toThrow('signature');
    const sig = await owner.signMessage({ message: c.message });
    const outcomes = await Promise.allSettled([s.tokens.issue(s.ownerToken, c.grant.nonce, sig), s.tokens.issue(s.ownerToken, c.grant.nonce, sig)]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    s.identity.expiresAt = 1500;
    expect((await s.issue()).connection.expiresAt).toBe(1500);
  } finally { s.store.close(); }
});

test('bearer cannot change chain, account, scopes, or mint another token', async () => {
  const s = await fixture();
  try {
    const a = await s.issue({ scopes: ['read'] }), b = await s.issue();
    expect(await s.tokens.authenticate(s.request(a.token, 'POST'), 5042002)).toBeNull();
    expect(await s.tokens.authenticate(s.request(b.token, 'POST'), 5042002)).not.toBeNull();
    expect(await s.tokens.authenticate(s.request(b.token), 11155111)).toBeNull();
    expect(await s.tokens.authenticate(s.request(b.token, 'GET', owner.address))).toBeNull();
    expect((await s.tokens.authenticate(s.request(a.token)))?.id).not.toBe((await s.tokens.authenticate(s.request(b.token)))?.id);
    await expect(s.tokens.challenge(a.token, s.input)).rejects.toThrow();
    await expect(s.tokens.challenge(s.ownerToken, { ...s.input, account: owner.address })).rejects.toThrow('associated');
    await expect(s.tokens.challenge(s.ownerToken, { ...s.input, scopes: ['read', 'sign' as AgentTokenScope] })).rejects.toThrow('permissions');
    await s.tokens.revoke(s.ownerToken, a.connection.id);
    expect(await s.tokens.authenticate(s.request(a.token))).toBeNull();
    expect(await s.tokens.authenticate(s.request(b.token))).not.toBeNull();
  } finally { s.store.close(); }
});

for (const change of ['controller', 'registration', 'account epoch', 'identity expiry'] as const) test(`bearer fails after ${change} changes`, async () => {
  const s = await fixture();
  try {
    const issued = await s.issue();
    if (change === 'controller') s.identity.controller = payment.address;
    if (change === 'registration') s.identity.registration = identityFingerprint('v2');
    if (change === 'account epoch') s.changeEpoch();
    if (change === 'identity expiry') s.identity.expiresAt = 999;
    expect(await s.tokens.authenticate(s.request(issued.token))).toBeNull();
  } finally { s.store.close(); }
});

test('token management requires owner cookie, same origin and exact owner signature', async () => {
  const s = await fixture();
  try {
    const routes = createIdentityRoutes(s.auth, origin, s.associations, s.tokens);
    const call = (path: string, body: unknown, headers: Record<string, string> = {}) => routes(new Request(`${origin}/identity/tokens${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    }));
    expect((await call('/challenge', s.input, { cookie: `wayleave_identity=${s.ownerToken}` }))?.status).toBe(403);
    expect((await call('/challenge', s.input, { origin }))?.status).toBe(400);
    const headers = { origin, cookie: `wayleave_identity=${s.ownerToken}` };
    const response = await call('/challenge', s.input, headers);
    const challenge = await response!.json();
    expect(response?.status).toBe(200);
    expect((await call('/issue', { nonce: challenge.grant.nonce, signature: await payment.signMessage({ message: challenge.message }) }, headers))?.status).toBe(400);
    const issued = await call('/issue', { nonce: challenge.grant.nonce, signature: await owner.signMessage({ message: challenge.message }) }, headers);
    expect(issued?.status).toBe(200);
    const result = await issued!.json();
    const listed = await routes(new Request(`${origin}/identity/tokens`, { headers: { cookie: headers.cookie } }));
    expect(await listed!.text()).not.toContain(result.token);
    expect((await call(`/${result.connection.id}/revoke`, {}, headers))?.status).toBe(200);
    expect(await s.tokens.authenticate(s.request(result.token))).toBeNull();
  } finally { s.store.close(); }
});
