import type { AgentTokens } from './agent-tokens';
import type { createIdentityAssociations } from './identity-associations';
import { IdentityError } from './identity-error';
import { randomBytes, createHash } from 'node:crypto';
import { isAddress, type Address, type Hex } from 'viem';
import { identityProofMessage, normalizeIdentityName, portableIdentityDeployment, type IdentityProof, type PortableIdentity, type PortableMembership } from '@mandate/sdk';
import type { SqlDatabase } from './database';
import type { IdentityResolver } from './identity-resolver';
type Snapshot = {
    identity: PortableIdentity;
    membership?: PortableMembership;
};
type Challenge = {
    proof: IdentityProof;
    snapshot: Snapshot;
};
export type IdentitySession = Snapshot & {
    kind: 'owner' | 'agent';
    expiresAt: number;
    audience: string;
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** Persistent, single-use proof storage shared across local and hosted gateway instances. */
export function createIdentityAuth(options: {
    db: SqlDatabase;
    resolver: IdentityResolver;
    audience: string;
    now?: () => number;
}) {
    const { db, resolver } = options;
    const audience = new URL(options.audience).origin;
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const ready = (async () => {
        for (const sql of [
            'CREATE TABLE IF NOT EXISTS identity_rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL)',
            'CREATE TABLE IF NOT EXISTS identity_challenges (nonce TEXT PRIMARY KEY, payload TEXT NOT NULL, expiresAt INTEGER NOT NULL, usedAt INTEGER)',
            'CREATE TABLE IF NOT EXISTS identity_sessions (hash TEXT PRIMARY KEY, payload TEXT NOT NULL, expiresAt INTEGER NOT NULL)',
            'CREATE TABLE IF NOT EXISTS identity_workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, deployment TEXT NOT NULL, registration TEXT NOT NULL, controller TEXT NOT NULL, createdAt INTEGER NOT NULL)',
        ])
            await db.query(sql).run();
    })();
    async function current(snapshot: Snapshot): Promise<Snapshot> {
        const fresh = snapshot.membership ? await resolver.membership(snapshot.identity.name, snapshot.membership.name) : await resolver.discover(snapshot.identity.name);
        const next: Snapshot = 'identity' in fresh ? { identity: fresh.identity, membership: fresh } : { identity: fresh };
        if (next.identity.registration !== snapshot.identity.registration || !same(next.identity.controller, snapshot.identity.controller))
            throw new IdentityError('Identity registration or control changed; authenticate again');
        if (snapshot.membership && (!next.membership || !same(next.membership.key, snapshot.membership.key) || next.membership.generation !== snapshot.membership.generation || JSON.stringify(next.membership.scopes) !== JSON.stringify(snapshot.membership.scopes)))
            throw new IdentityError('Agent enrollment changed; authenticate again');
        return next;
    }
    return {
        async revalidateIdentity(identity: PortableIdentity) {
            return (await current({ identity })).identity;
        },
        async verifyOwnerMessage(token: string, message: string, signature: Hex) {
            const session = await this.authenticate(token);
            if (session.kind !== 'owner' || !/^0x[0-9a-fA-F]{2,16384}$/.test(signature) ||
                !await resolver.verify(session.identity.controller, message, signature))
                throw new IdentityError('Identity owner signature required');
            return session;
        },
        async takeRateLimit() {
            await ready;
            const bucket = `${audience}:${Math.floor(now() / 60)}`;
            await db.query('INSERT INTO identity_rate_limits (bucket,count) VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1').run(bucket);
            const row = await db.query('SELECT count FROM identity_rate_limits WHERE bucket=?').get(bucket) as {
                count: number;
            };
            if (row.count > 120)
                throw new IdentityError('Too many identity requests; try again in one minute');
        },
        async challenge(input: {
            deployment: string;
            kind: 'owner' | 'agent';
            name: string;
            identity?: string;
        }) {
            await ready;
            if (input.deployment !== portableIdentityDeployment || !['owner', 'agent'].includes(input.kind))
                throw new IdentityError('Select the ENSv2 ETHOnline Sepolia deployment');
            const name = normalizeIdentityName(input.name);
            const membership = input.kind === 'agent' ? await resolver.membership(input.identity ?? '', name) : undefined;
            const identity = membership?.identity ?? await resolver.discover(name);
            const proof: IdentityProof = { nonce: random(), audience, deployment: portableIdentityDeployment, kind: input.kind, name, identity: identity.name, registration: identity.registration, key: membership?.key ?? identity.controller, generation: membership?.generation ?? identity.registration, expiresAt: Math.min(now() + 300, membership?.expiresAt ?? identity.expiresAt) };
            const snapshot: Snapshot = { identity, ...(membership ? { membership } : {}) };
            await db.query('INSERT INTO identity_challenges (nonce,payload,expiresAt) VALUES (?,?,?)').run(proof.nonce, JSON.stringify({ proof, snapshot }), proof.expiresAt);
            return { proof, message: identityProofMessage(proof) };
        },
        async verify(nonce: string, signature: Hex) {
            await ready;
            if (!/^[a-f0-9]{64}$/.test(nonce) || !/^0x[0-9a-fA-F]+$/.test(signature) || signature.length > 16386)
                throw new IdentityError('Invalid identity proof');
            const row = await db.query('SELECT payload FROM identity_challenges WHERE nonce=? AND usedAt IS NULL AND expiresAt>?').get(nonce, now()) as {
                payload: string;
            } | null;
            if (!row)
                throw new IdentityError('Identity challenge expired or used');
            const { proof, snapshot } = JSON.parse(row.payload) as Challenge;
            if (proof.audience !== audience || !(await resolver.verify(proof.key, identityProofMessage(proof), signature)))
                throw new IdentityError('Identity signature does not match this gateway challenge');
            const fresh = await current(snapshot);
            const consumed = await db.query('UPDATE identity_challenges SET usedAt=? WHERE nonce=? AND usedAt IS NULL AND expiresAt>?').run(now(), nonce, now());
            if (consumed.changes !== 1)
                throw new IdentityError('Identity challenge expired or used');
            const token = random();
            const expiresAt = Math.min(now() + 900, fresh.membership?.expiresAt ?? fresh.identity.expiresAt);
            const session: IdentitySession = { ...fresh, kind: proof.kind, expiresAt, audience };
            await db.query('INSERT INTO identity_sessions (hash,payload,expiresAt) VALUES (?,?,?)').run(hash(token), JSON.stringify(session), expiresAt);
            if (proof.kind === 'owner')
                await db.query('INSERT OR IGNORE INTO identity_workspaces (id,name,deployment,registration,controller,createdAt) VALUES (?,?,?,?,?,?)').run(hash(`${proof.deployment}:${fresh.identity.name}:${proof.registration}`), fresh.identity.name, proof.deployment, proof.registration, fresh.identity.controller, now());
            return { token, session };
        },
        async authenticate(token: string): Promise<IdentitySession> {
            await ready;
            if (!/^[a-f0-9]{64}$/.test(token))
                throw new IdentityError('Identity session required');
            const row = await db.query('SELECT payload FROM identity_sessions WHERE hash=? AND expiresAt>?').get(hash(token), now()) as {
                payload: string;
            } | null;
            if (!row)
                throw new IdentityError('Identity session expired');
            const session = JSON.parse(row.payload) as IdentitySession;
            if (session.audience !== audience)
                throw new IdentityError('Identity session belongs to another gateway');
            return { ...session, ...await current(session) };
        },
        async logout(token: string) { await ready; await db.query('DELETE FROM identity_sessions WHERE hash=?').run(hash(token)); },
        async discover(name: string, deployment: string) {
            if (deployment !== portableIdentityDeployment)
                throw new IdentityError('Select the ENSv2 ETHOnline Sepolia deployment');
            return resolver.discover(name);
        },
    };
}
export type IdentityAuth = ReturnType<typeof createIdentityAuth>;
/** Can be mounted in createApp({ routes: [handler] }). Owner sessions use HttpOnly cookies. */
export function createIdentityRoutes(auth: IdentityAuth, audience: string, associations?: ReturnType<typeof createIdentityAssociations>, tokens?: AgentTokens) {
    const origin = new URL(audience).origin;
    const cookieToken = (request: Request) => request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith('wayleave_identity='))?.slice('wayleave_identity='.length) ?? '';
    const cookie = (token: string, age: number) => `wayleave_identity=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${origin.startsWith('https:') ? '; Secure' : ''}`;
    return async (request: Request): Promise<Response | null> => {
        const url = new URL(request.url);
        if (!url.pathname.startsWith('/identity/'))
            return null;
        const json = (body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });
        try {
            await auth.takeRateLimit();
            if (request.headers.get('origin') && request.headers.get('origin') !== origin)
                return json({ error: 'Origin not allowed' }, 403);
            if (url.pathname === '/identity/discover' && request.method === 'GET')
                return json(await auth.discover(url.searchParams.get('name') ?? '', url.searchParams.get('deployment') ?? ''));
            if (url.pathname === '/identity/session' && request.method === 'GET')
                return json(await auth.authenticate(cookieToken(request)));
            if (url.pathname === '/identity/accounts' && request.method === 'GET' && associations)
                return json({ accounts: await associations.list(cookieToken(request)) });
            if (url.pathname === '/identity/tokens' && request.method === 'GET' && tokens)
                return json({ connections: await tokens.list(cookieToken(request)) });
            if (request.method !== 'POST')
                return json({ error: 'Not found' }, 404);
            if (Number(request.headers.get('content-length') ?? 0) > 20000)
                return json({ error: 'Request too large' }, 413);
            // Stream bounded input; do not trust Content-Length.
            const reader = request.body?.getReader();
            let raw = '';
            let size = 0;
            const decoder = new TextDecoder();
            if (reader)
                while (true) {
                    const next = await reader.read();
                    if (next.done)
                        break;
                    size += next.value.byteLength;
                    if (size > 20000) {
                        await reader.cancel();
                        return json({ error: 'Request too large' }, 413);
                    }
                    raw += decoder.decode(next.value, { stream: true });
                }
            raw += decoder.decode();
            const body = JSON.parse(raw || '{}');
            if (url.pathname.startsWith('/identity/tokens')) {
                if (request.headers.get('origin') !== origin) return json({ error: 'Origin required' }, 403);
                if (!tokens) return json({ error: 'Agent token service unavailable' }, 503);
                if (url.pathname === '/identity/tokens/challenge') return json(await tokens.challenge(cookieToken(request), body));
                if (url.pathname === '/identity/tokens/issue') return json(await tokens.issue(cookieToken(request), body.nonce, body.signature));
                const id = url.pathname.match(/^\/identity\/tokens\/(token_[a-f0-9-]{36})\/revoke$/)?.[1];
                if (id) { await tokens.revoke(cookieToken(request), id); return json({ ok: true }); }
                return json({ error: 'Not found' }, 404);
            }
            if (url.pathname === '/identity/challenge') {
                if (body.kind === 'owner' && request.headers.get('origin') !== origin)
                    return json({ error: 'Owner authentication requires the site origin' }, 403);
                return json(await auth.challenge(body));
            }
            if (url.pathname === '/identity/verify') {
                const result = await auth.verify(body.nonce, body.signature);
                if (result.session.kind === 'owner') {
                    // No bearer token exposed to browser JavaScript.
                    if (request.headers.get('origin') !== origin) {
                        await auth.logout(result.token);
                        return json({ error: 'Owner authentication requires the site origin' }, 403);
                    }
                    return json({ session: result.session }, 200, { 'set-cookie': cookie(result.token, 900) });
                }
                return json(result);
            }
            if (url.pathname === '/identity/accounts/challenge' || url.pathname === '/identity/accounts/attach') {
                if (request.headers.get('origin') !== origin)
                    return json({ error: 'Origin required' }, 403);
                if (!associations)
                    return json({ error: 'Payment account association is not configured' }, 503);
                if (url.pathname.endsWith('/challenge'))
                    return json(await associations.challenge(cookieToken(request), body.chainId, body.account));
                if (typeof body.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(body.nonce) || typeof body.signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(body.signature) || body.signature.length > 16386)
                    return json({ error: 'Invalid account proof' }, 400);
                return json(await associations.attach(cookieToken(request), body.nonce, body.signature));
            }
            if (url.pathname === '/identity/logout') {
                if (request.headers.get('origin') !== origin)
                    return json({ error: 'Origin required' }, 403);
                await auth.logout(cookieToken(request));
                return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });
            }
            return json({ error: 'Not found' }, 404);
        }
        catch (error) {
            return json({ error: error instanceof IdentityError ? error.message : 'Identity verification is unavailable; retry when the network is healthy' }, 400);
        }
    };
}
