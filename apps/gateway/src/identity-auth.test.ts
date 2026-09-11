import { test, expect } from 'bun:test';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage, zeroAddress, type Hex } from 'viem';
import { identityFingerprint, portableIdentityDeployment, type PortableIdentity, type PortableMembership } from '@mandate/sdk';
import { Store } from './store';
import { createIdentityAuth, createIdentityRoutes } from './identity-auth';
import type { IdentityResolver } from './identity-resolver';
const owner = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const agent = privateKeyToAccount(`0x${'22'.repeat(32)}`);
function setup() {
    const store = new Store(':memory:');
    let time = 1000;
    const identity: PortableIdentity = { name: 'desk.wayleave.eth', deployment: portableIdentityDeployment, chainId: 11155111, registry: owner.address, controller: owner.address, resolver: zeroAddress, subregistry: owner.address, registration: identityFingerprint('first'), expiresAt: 9000, canSetSubregistry: true };
    const member: PortableMembership = { identity, name: 'codex.desk.wayleave.eth', key: agent.address, generation: '1', expiresAt: 8000, scopes: ['read'] };
    let unavailable = false;
    const resolver: IdentityResolver = { discover: async () => { if (unavailable)
            throw new Error('secret RPC URL'); return structuredClone(identity); }, membership: async (i, n) => { if (unavailable)
            throw new Error('secret RPC URL'); if (i !== identity.name || n !== member.name || member.key === zeroAddress)
            throw new Error('Removed'); return structuredClone(member); }, verify: async (address, message, signature) => verifyMessage({ address, message, signature }) };
    const auth = createIdentityAuth({ db: store.db, resolver, audience: 'https://gateway.example', now: () => time });
    return { store, auth, identity, member, resolver, setTime: (n: number) => time = n, setUnavailable: () => unavailable = true };
}
async function login(s: ReturnType<typeof setup>, kind: 'owner' | 'agent' = 'agent') {
    const challenge = await s.auth.challenge({ deployment: portableIdentityDeployment, kind, name: kind === 'owner' ? s.identity.name : s.member.name, identity: s.identity.name });
    const signature = await (kind === 'owner' ? owner : agent).signMessage({ message: challenge.message });
    return { challenge, signature, ...await s.auth.verify(challenge.proof.nonce, signature) };
}
test('portable authentication persists across gateway instances and consumes proof once', async () => {
    const s = setup();
    try {
        const result = await login(s);
        expect(result.session.membership?.scopes).toEqual(['read']);
        await expect(s.auth.verify(result.challenge.proof.nonce, result.signature)).rejects.toThrow('used');
        const another = createIdentityAuth({ db: s.store.db, resolver: s.resolver, audience: 'https://gateway.example', now: () => 1000 });
        expect((await another.authenticate(result.token)).kind).toBe('agent');
    }
    finally {
        s.store.close();
    }
});
test('owner name-first workspace attaches no payment authority', async () => { const s = setup(); try {
    const result = await login(s, 'owner');
    expect(result.session.membership).toBeUndefined();
    expect(await s.store.db.query('SELECT count(*) AS n FROM identity_workspaces').get()).toEqual({ n: 1 });
}
finally {
    s.store.close();
} });
test('reject wrong key, cross-audience replay and expired challenges', async () => {
    const s = setup();
    try {
        const c = await s.auth.challenge({ deployment: portableIdentityDeployment, kind: 'agent', name: s.member.name, identity: s.identity.name });
        await expect(s.auth.verify(c.proof.nonce, await owner.signMessage({ message: c.message }))).rejects.toThrow('signature');
        const other = createIdentityAuth({ db: s.store.db, resolver: s.resolver, audience: 'https://other.example', now: () => 1000 });
        const signature = await agent.signMessage({ message: c.message });
        await expect(other.verify(c.proof.nonce, signature)).rejects.toThrow('gateway');
        s.setTime(1301);
        await expect(s.auth.verify(c.proof.nonce, signature)).rejects.toThrow('expired');
    }
    finally {
        s.store.close();
    }
});
for (const change of ['rotation', 'removal', 'registration', 'scope', 'stale'] as const)
    test(`session rejects ${change}`, async () => { const s = setup(); try {
        const result = await login(s);
        if (change === 'rotation')
            s.member.generation = '2';
        if (change === 'removal')
            s.member.key = zeroAddress;
        if (change === 'registration')
            s.identity.registration = identityFingerprint('second');
        if (change === 'scope')
            s.member.scopes = ['propose_payment'];
        if (change === 'stale')
            s.setUnavailable();
        await expect(s.auth.authenticate(result.token)).rejects.toThrow();
    }
    finally {
        s.store.close();
    } });
test('concurrent proof submissions issue only one session', async () => { const s = setup(); try {
    const c = await s.auth.challenge({ deployment: portableIdentityDeployment, kind: 'owner', name: s.identity.name });
    const signature = await owner.signMessage({ message: c.message });
    const results = await Promise.allSettled([s.auth.verify(c.proof.nonce, signature), s.auth.verify(c.proof.nonce, signature)]);
    expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
}
finally {
    s.store.close();
} });
test('routes hide upstream diagnostics and require explicit deployment', async () => { const s = setup(); try {
    const route = createIdentityRoutes(s.auth, 'https://gateway.example');
    s.setUnavailable();
    const response = await route(new Request(`https://gateway.example/identity/discover?name=desk.eth&deployment=${portableIdentityDeployment}`));
    expect(await response?.text()).not.toContain('secret RPC');
    await expect(s.auth.discover('desk.eth', 'mainnet')).rejects.toThrow('Select');
}
finally {
    s.store.close();
} });
