import { randomBytes, createHash } from 'node:crypto';
import { isAddress, type Address, type Hex } from 'viem';
import type { IdentityAuth, IdentitySession } from './identity-auth';
import type { SqlDatabase } from './database';
import { IdentityError } from './identity-error';
export type IdentityAccount = {
    chainId: number;
    account: Address;
    controller: Address;
    epoch: string;
};
export interface IdentityAccountVerifier {
    ownership(chainId: number, account: Address): Promise<{
        controller: Address;
        epoch: string;
    }>;
    verify(chainId: number, controller: Address, message: string, signature: Hex): Promise<boolean>;
}
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
/** Separate proof by the payment controller; the ENS session never substitutes for it. */
export function createIdentityAssociations(db: SqlDatabase, auth: IdentityAuth, accounts: IdentityAccountVerifier, now: () => number = () => Math.floor(Date.now() / 1000)) {
    const ready = (async () => {
        for (const sql of [
            'CREATE TABLE IF NOT EXISTS identity_account_challenges (nonce TEXT PRIMARY KEY, payload TEXT NOT NULL, expiresAt INTEGER NOT NULL, usedAt INTEGER)',
            'CREATE TABLE IF NOT EXISTS identity_accounts (id TEXT PRIMARY KEY, identity TEXT NOT NULL, registration TEXT NOT NULL, payload TEXT NOT NULL, createdAt INTEGER NOT NULL)',
        ])
            await db.query(sql).run();
    })();
    return {
        async challenge(token: string, chainId: number, account: Address) {
            await ready;
            const session = await auth.authenticate(token);
            if (session.kind !== 'owner')
                throw new IdentityError('Identity owner session required');
            if (!Number.isSafeInteger(chainId) || chainId <= 0 || !isAddress(account))
                throw new IdentityError('Invalid account chain or address');
            const ownership = await accounts.ownership(chainId, account);
            const nonce = randomBytes(32).toString('hex');
            const expiresAt = now() + 300;
            const binding = { version: 1, audience: session.audience, deployment: session.identity.deployment, identity: session.identity.name, registration: session.identity.registration, identityController: session.identity.controller, chainId, account, controller: ownership.controller, epoch: ownership.epoch, nonce, expiresAt };
            const message = `Wayleave account association v1\nAssociate this payment account with the named identity. This grants no spending authority.\n${JSON.stringify(binding)}`;
            await db.query('INSERT INTO identity_account_challenges (nonce,payload,expiresAt) VALUES (?,?,?)').run(nonce, JSON.stringify({ binding, message }), expiresAt);
            return { binding, message };
        },
        async attach(token: string, nonce: string, signature: Hex) {
            await ready;
            const session = await auth.authenticate(token);
            if (session.kind !== 'owner')
                throw new IdentityError('Identity owner session required');
            const row = await db.query('SELECT payload FROM identity_account_challenges WHERE nonce=? AND usedAt IS NULL AND expiresAt>?').get(nonce, now()) as {
                payload: string;
            } | null;
            if (!row)
                throw new IdentityError('Account association challenge expired or used');
            const { binding: b, message } = JSON.parse(row.payload);
            if (b.audience !== session.audience || b.identity !== session.identity.name || b.registration !== session.identity.registration || b.identityController.toLowerCase() !== session.identity.controller.toLowerCase())
                throw new IdentityError('Identity association changed');
            const ownership = await accounts.ownership(b.chainId, b.account);
            if (ownership.controller.toLowerCase() !== b.controller.toLowerCase() || ownership.epoch !== b.epoch || !await accounts.verify(b.chainId, b.controller, message, signature))
                throw new IdentityError('Payment account controller proof failed');
            const result = await db.query('UPDATE identity_account_challenges SET usedAt=? WHERE nonce=? AND usedAt IS NULL AND expiresAt>?').run(now(), nonce, now());
            if (result.changes !== 1)
                throw new IdentityError('Account association challenge expired or used');
            const id = hash(`${b.deployment}:${b.identity}:${b.registration}:${b.chainId}:${b.account.toLowerCase()}`);
            await db.query('INSERT OR REPLACE INTO identity_accounts (id,identity,registration,payload,createdAt) VALUES (?,?,?,?,?)').run(id, b.identity, b.registration, JSON.stringify(b), now());
            return { id, chainId: b.chainId, account: b.account };
        },
        async resolveAgent(token: string, chainId: number, selectedAccount?: Address) {
            const session = await auth.authenticate(token);
            if (session.kind !== 'agent' || !session.membership)
                throw new IdentityError('Portable agent session required');
            await ready;
            const rows = await db.query('SELECT payload FROM identity_accounts WHERE identity=? AND registration=?').all(session.identity.name, session.identity.registration) as {
                payload: string;
            }[];
            const candidates = rows.map(row => JSON.parse(row.payload)).filter(b => b.chainId === chainId && (!selectedAccount || b.account.toLowerCase() === selectedAccount.toLowerCase()));
            if (candidates.length !== 1)
                throw new IdentityError(candidates.length ? 'Choose a specific associated payment account' : 'No associated payment account on this chain');
            const b = candidates[0];
            const account = await this.authorize(session, chainId, b.account);
            const membership = session.membership;
            const id = hash(`${session.identity.deployment}:${session.identity.name}:${session.identity.registration}:${membership.name}:${membership.key.toLowerCase()}:${membership.generation}:${chainId}:${account.account.toLowerCase()}:${account.epoch}`);
            return { id: `ens_${id}`, account: account.account, owner: account.controller, scopes: membership.scopes, name: membership.name, expiresAt: session.expiresAt };
        },
        async authorize(session: IdentitySession, chainId: number, account: Address): Promise<IdentityAccount> {
            await ready;
            const id = hash(`${session.identity.deployment}:${session.identity.name}:${session.identity.registration}:${chainId}:${account.toLowerCase()}`);
            const row = await db.query('SELECT payload FROM identity_accounts WHERE id=?').get(id) as {
                payload: string;
            } | null;
            if (!row)
                throw new IdentityError('Payment account has not been associated with this identity');
            const b = JSON.parse(row.payload);
            const current = await accounts.ownership(chainId, account);
            if (b.identityController.toLowerCase() !== session.identity.controller.toLowerCase() || b.controller.toLowerCase() !== current.controller.toLowerCase() || b.epoch !== current.epoch)
                throw new IdentityError('Payment account control changed; associate it again');
            return { chainId, account, controller: current.controller, epoch: current.epoch };
        },
    };
}
