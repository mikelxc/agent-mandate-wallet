import { test, expect } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage, zeroAddress } from 'viem';
import { identityFingerprint, portableIdentityDeployment, type PortableIdentity, type PortableMembership } from '@mandate/sdk';
import { Store } from './store';
import { createIdentityAuth } from './identity-auth';
import { createIdentityAssociations } from './identity-associations';
const owner = privateKeyToAccount(`0x${'11'.repeat(32)}`), payment = privateKeyToAccount(`0x${'33'.repeat(32)}`), agent = privateKeyToAccount(`0x${'22'.repeat(32)}`);
async function fixture(scopes: PortableMembership['scopes'] = ['read', 'propose_payment']) {
    const store = new Store(':memory:');
    let epoch = '1';
    const identity: PortableIdentity = { name: 'desk.eth', deployment: portableIdentityDeployment, chainId: 11155111, registry: owner.address, controller: owner.address, resolver: zeroAddress, subregistry: owner.address, registration: identityFingerprint('v1'), expiresAt: 9000, canSetSubregistry: true };
    const membership: PortableMembership = { identity, name: 'codex.desk.eth', key: agent.address, generation: '1', expiresAt: 8000, scopes };
    const auth = createIdentityAuth({ db: store.db, audience: 'https://gateway.example', now: () => 1000, resolver: { discover: async () => structuredClone(identity), membership: async () => structuredClone(membership), verify: async (address, message, signature) => verifyMessage({ address, message, signature }) } });
    const sessions = await Promise.all((['owner', 'agent'] as const).map(async (kind) => { const c = await auth.challenge({ deployment: portableIdentityDeployment, kind, name: kind === 'owner' ? identity.name : membership.name, identity: identity.name }); return auth.verify(c.proof.nonce, await (kind === 'owner' ? owner : agent).signMessage({ message: c.message })); }));
    const associations = createIdentityAssociations(store.db, auth, { ownership: async (chainId) => { if (chainId !== 5042002)
            throw new Error('Unsupported chain'); return { controller: payment.address, epoch }; }, verify: async (chainId, controller, message, signature) => chainId === 5042002 && verifyMessage({ address: controller, message, signature }) }, () => 1000);
    return { store, associations, ownerToken: sessions[0].token, agentToken: sessions[1].token, membership, identity, setEpoch: () => epoch = '2' };
}
test('requires distinct payment-controller proof; agent cannot attach accounts', async () => {
    const s = await fixture();
    try {
        await expect(s.associations.challenge(s.agentToken, 5042002, payment.address)).rejects.toThrow('owner session');
        const c = await s.associations.challenge(s.ownerToken, 5042002, payment.address);
        await expect(s.associations.attach(s.ownerToken, c.binding.nonce, await owner.signMessage({ message: c.message }))).rejects.toThrow('controller proof');
        await s.associations.attach(s.ownerToken, c.binding.nonce, await payment.signMessage({ message: c.message }));
        const connection = await s.associations.resolveAgent(s.agentToken, 5042002);
        expect(connection.owner).toBe(payment.address);
        expect(connection.scopes).toEqual(['read', 'propose_payment']);
        await expect(s.associations.resolveAgent(s.agentToken, 11155111)).rejects.toThrow('No associated');
        await expect(s.associations.attach(s.ownerToken, c.binding.nonce, await payment.signMessage({ message: c.message }))).rejects.toThrow('used');
        s.setEpoch();
        await expect(s.associations.resolveAgent(s.agentToken, 5042002)).rejects.toThrow('control changed');
    }
    finally {
        s.store.close();
    }
});
test('membership rotation revokes access to attached account', async () => { const s = await fixture(); try {
    const c = await s.associations.challenge(s.ownerToken, 5042002, payment.address);
    await s.associations.attach(s.ownerToken, c.binding.nonce, await payment.signMessage({ message: c.message }));
    s.membership.generation = '2';
    await expect(s.associations.resolveAgent(s.agentToken, 5042002)).rejects.toThrow('enrollment changed');
}
finally {
    s.store.close();
} });
test('portable runtime hook creates FK-safe agent row and respects local revocation', async () => {
    const { createPortableAgentAuthentication } = await import('./runtime-integrations');
    const s = await fixture();
    try {
        const c = await s.associations.challenge(s.ownerToken, 5042002, payment.address);
        await s.associations.attach(s.ownerToken, c.binding.nonce, await payment.signMessage({ message: c.message }));
        const authenticate = createPortableAgentAuthentication(s.store, s.associations);
        const request = new Request('https://gateway.example/agent/crosschain', { headers: { authorization: `Bearer ${s.agentToken}` } });
        const connection = await authenticate(request, 5042002);
        expect(connection).not.toBeNull();
        const row = await s.store.db.query('SELECT id,tokenHash FROM agents WHERE id=?').get(connection!.id) as {
            id: string;
            tokenHash: string;
        };
        expect(row.tokenHash).toBe(`identity:${row.id}`);
        // Audit references share the same backing row as payment operations.
        await s.store.db.query('INSERT INTO audit_events (id,agentId,event,createdAt) VALUES (?,?,?,?)').run('portable-audit', connection!.id, 'portable_authenticated', 1000);
        await s.store.db.query('UPDATE agents SET revokedAt=? WHERE id=?').run(1000, connection!.id);
        expect(await authenticate(request, 5042002)).toBeNull();
    }
    finally {
        s.store.close();
    }
});
test('portable runtime hook enforces per-method scopes and selected account', async () => {
    const { createPortableAgentAuthentication } = await import('./runtime-integrations');
    const s = await fixture(['read']);
    try {
        const c = await s.associations.challenge(s.ownerToken, 5042002, payment.address);
        await s.associations.attach(s.ownerToken, c.binding.nonce, await payment.signMessage({ message: c.message }));
        const authenticate = createPortableAgentAuthentication(s.store, s.associations);
        expect(await authenticate(new Request('https://gateway.example/agent/crosschain', { headers: { authorization: `Bearer ${s.agentToken}` } }), 5042002)).not.toBeNull();
        expect(await authenticate(new Request('https://gateway.example/agent/crosschain', { method: 'POST', headers: { authorization: `Bearer ${s.agentToken}` } }), 5042002)).toBeNull();
        expect(await authenticate(new Request('https://gateway.example/agent/crosschain', { headers: { authorization: `Bearer ${s.agentToken}`, 'x-wayleave-account': 'invalid' } }), 5042002)).toBeNull();
    }
    finally {
        s.store.close();
    }
});
