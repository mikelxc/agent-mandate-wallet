import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isAddress, type Address, type Hex } from 'viem';
import { agentTokenMessage, type AgentTokenGrant, type AgentTokenScope } from '@mandate/sdk';
import type { Store } from './store';
import type { IdentityAuth, IdentitySession } from './identity-auth';
import type { createIdentityAssociations } from './identity-associations';
import { IdentityError } from './identity-error';

const hash = (v: string) => createHash('sha256').update(v).digest('hex');
type StoredGrant = { grant: AgentTokenGrant; session: IdentitySession };
export type AgentTokenInfo = { id: string; name: string; account: Address; chainId: number; scopes: AgentTokenScope[]; expiresAt: number; revokedAt: number | null; createdAt: number };
export function createAgentTokens(store: Store, auth: IdentityAuth, associations: ReturnType<typeof createIdentityAssociations>, audience: string, now = () => Math.floor(Date.now() / 1000)) {
  const db = store.db;
  const origin = new URL(audience).origin;
  const ready = (async () => {
    await db.query('CREATE TABLE IF NOT EXISTS agent_token_challenges (nonce TEXT PRIMARY KEY, payload TEXT NOT NULL, expiresAt INTEGER NOT NULL, usedAt INTEGER)').run();
    await db.query('CREATE TABLE IF NOT EXISTS agent_tokens (id TEXT PRIMARY KEY, tokenHash TEXT NOT NULL UNIQUE, identity TEXT NOT NULL, registration TEXT NOT NULL, payload TEXT NOT NULL, expiresAt INTEGER NOT NULL, revokedAt INTEGER, createdAt INTEGER NOT NULL)').run();
  })();
  async function owner(token: string) {
    const session = await auth.authenticate(token);
    if (session.kind !== 'owner') throw new IdentityError('Sign in as the ENS identity owner');
    return session;
  }
  function sameIdentity(a: IdentitySession, b: IdentitySession) {
    return a.audience === origin && b.audience === origin && a.identity.name === b.identity.name &&
      a.identity.registration === b.identity.registration && a.identity.controller.toLowerCase() === b.identity.controller.toLowerCase();
  }
  function info(row: { id: string; payload: string; expiresAt: number; revokedAt: number | null; createdAt: number }): AgentTokenInfo {
    const { grant } = JSON.parse(row.payload) as StoredGrant;
    return { id: row.id, name: grant.name, account: grant.account, chainId: grant.chainId, scopes: grant.scopes, expiresAt: row.expiresAt, revokedAt: row.revokedAt, createdAt: row.createdAt };
  }
  return {
    async challenge(ownerToken: string, input: { name: string; chainId: number; account: Address; scopes: AgentTokenScope[]; durationSeconds: number }) {
      await ready;
      const session = await owner(ownerToken);
      if (session.audience !== origin) throw new IdentityError('Wrong gateway audience');
      if (typeof input.name !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.name)) throw new IdentityError('Enter a lowercase connection label');
      if (![11155111, 5042002].includes(input.chainId) || !isAddress(input.account)) throw new IdentityError('Select a supported associated account');
      if (!Number.isSafeInteger(input.durationSeconds) || input.durationSeconds < 900 || input.durationSeconds > 2592000) throw new IdentityError('Session length must be between 15 minutes and 30 days');
      if (!Array.isArray(input.scopes) || !input.scopes.includes('read') || input.scopes.some(s => !['read', 'propose_payment'].includes(s)) || new Set(input.scopes).size !== input.scopes.length) throw new IdentityError('Invalid agent permissions');
      const account = await associations.authorize(session, input.chainId, input.account);
      const grant: AgentTokenGrant = { version: 1, audience: origin, identity: session.identity.name, registration: session.identity.registration,
        identityController: session.identity.controller, name: `${input.name}.${session.identity.name}`, chainId: input.chainId, account: input.account.toLowerCase() as Address,
        accountController: account.controller, accountEpoch: account.epoch, scopes: ['read', ...(input.scopes.includes('propose_payment') ? ['propose_payment' as const] : [])],
        durationSeconds: input.durationSeconds, tokenExpiresAt: Math.min(now() + input.durationSeconds, session.identity.expiresAt), nonce: randomBytes(32).toString('hex'), expiresAt: now() + 300 };
      if (grant.tokenExpiresAt <= now()) throw new IdentityError('Identity expired');
      await db.query('INSERT INTO agent_token_challenges (nonce,payload,expiresAt) VALUES (?,?,?)').run(grant.nonce, JSON.stringify({ grant, session }), grant.expiresAt);
      return { grant, message: agentTokenMessage(grant) };
    },
    async issue(ownerToken: string, nonce: string, signature: Hex) {
      await ready;
      if (typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) throw new IdentityError('Invalid token challenge');
      const row = await db.query('SELECT payload FROM agent_token_challenges WHERE nonce=? AND usedAt IS NULL AND expiresAt>?').get(nonce, now()) as { payload: string } | null;
      if (!row) throw new IdentityError('Token challenge expired or used');
      const saved = JSON.parse(row.payload) as StoredGrant;
      const session = await auth.verifyOwnerMessage(ownerToken, agentTokenMessage(saved.grant), signature);
      if (!sameIdentity(session, saved.session)) throw new IdentityError('Identity changed since token request');
      const account = await associations.authorize(session, saved.grant.chainId, saved.grant.account);
      if (account.epoch !== saved.grant.accountEpoch || account.controller.toLowerCase() !== saved.grant.accountController.toLowerCase() || saved.grant.tokenExpiresAt <= now()) throw new IdentityError('Account control or expiry changed');
      const id = `token_${randomUUID()}`, token = randomBytes(32).toString('hex'), createdAt = now();
      await db.transaction(async tx => {
        const used = await tx.query('UPDATE agent_token_challenges SET usedAt=? WHERE nonce=? AND usedAt IS NULL AND expiresAt>?').run(createdAt, nonce, createdAt);
        if (used.changes !== 1) throw new IdentityError('Token challenge expired or used');
        await tx.query('INSERT INTO agent_tokens (id,tokenHash,identity,registration,payload,expiresAt,revokedAt,createdAt) VALUES (?,?,?,?,?,?,NULL,?)').run(id, hash(token), session.identity.name, session.identity.registration, row.payload, saved.grant.tokenExpiresAt, createdAt);
        // Audit/operation FK row contains no usable credential; authentication is exclusively through the scoped token table.
        await tx.query('INSERT INTO agents (id,name,owner,account,tokenHash,expiresAt,revokedAt,createdAt) VALUES (?,?,?,?,?,?,NULL,?)').run(id, saved.grant.name, account.controller.toLowerCase(), saved.grant.account, `bearer:${id}`, saved.grant.tokenExpiresAt, createdAt);
      });
      return { token, connection: info({ id, payload: row.payload, expiresAt: saved.grant.tokenExpiresAt, revokedAt: null, createdAt }) };
    },
    async list(ownerToken: string) {
      await ready;
      const session = await owner(ownerToken);
      const rows = await db.query('SELECT id,payload,expiresAt,revokedAt,createdAt FROM agent_tokens WHERE identity=? AND registration=? ORDER BY createdAt DESC').all(session.identity.name, session.identity.registration) as Parameters<typeof info>[0][];
      return rows.filter(row => sameIdentity(session, (JSON.parse(row.payload) as StoredGrant).session)).map(info);
    },
    async revoke(ownerToken: string, id: string) {
      await ready;
      const session = await owner(ownerToken);
      const row = await db.query('SELECT payload FROM agent_tokens WHERE id=?').get(id) as { payload: string } | null;
      if (!row || !sameIdentity(session, (JSON.parse(row.payload) as StoredGrant).session)) throw new IdentityError('Connection not found');
      await db.transaction(async tx => {
        await tx.query('UPDATE agent_tokens SET revokedAt=COALESCE(revokedAt,?) WHERE id=?').run(now(), id);
        await tx.query('UPDATE agents SET revokedAt=COALESCE(revokedAt,?) WHERE id=?').run(now(), id);
      });
    },
    async authenticate(request: Request, chainId?: number) {
      await ready;
      const token = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      if (!token) return null;
      try {
        const row = await db.query('SELECT t.id,t.payload,t.expiresAt,t.createdAt FROM agent_tokens t JOIN agents a ON a.id=t.id WHERE t.tokenHash=? AND t.revokedAt IS NULL AND a.revokedAt IS NULL AND t.expiresAt>?').get(hash(token), now()) as { id: string; payload: string; expiresAt: number; createdAt: number } | null;
        if (!row) return null;
        const { grant, session } = JSON.parse(row.payload) as StoredGrant;
        if (grant.audience !== origin || (chainId !== undefined && grant.chainId !== chainId)) return null;
        if (request.headers.has('x-wayleave-account')) return null;
        if (!grant.scopes.includes(request.method === 'GET' ? 'read' : 'propose_payment')) return null;
        if (!await store.takeRateLimit(`bearer:${row.id}`, now(), 120)) return null;
        const identity = await auth.revalidateIdentity(session.identity);
        if (identity.expiresAt <= now()) return null;
        const account = await associations.authorize({ ...session, identity }, grant.chainId, grant.account);
        if (account.epoch !== grant.accountEpoch || account.controller.toLowerCase() !== grant.accountController.toLowerCase()) return null;
        return { id: row.id, name: grant.name, identity: identity.name, account: grant.account, owner: account.controller.toLowerCase(), scopes: grant.scopes, chainId: grant.chainId, expiresAt: row.expiresAt, revokedAt: null, createdAt: row.createdAt };
      } catch { return null; }
    },
  };
}
export type AgentTokens = ReturnType<typeof createAgentTokens>;
