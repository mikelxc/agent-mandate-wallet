import { keccak256, toHex, type Address, type Hex } from 'viem';
import { normalize } from 'viem/ens';
export const portableIdentityDeployment = 'ensv2-ethonline-sepolia' as const;
export type IdentityScope = 'read' | 'propose_payment';
export type PortableIdentity = {
    name: string;
    deployment: typeof portableIdentityDeployment;
    chainId: 11155111;
    registry: Address;
    controller: Address;
    resolver: Address;
    subregistry: Address;
    registration: Hex;
    expiresAt: number;
    canSetSubregistry: boolean;
};
export type PortableMembership = {
    identity: PortableIdentity;
    name: string;
    key: Address;
    generation: string;
    expiresAt: number;
    scopes: IdentityScope[];
};
export type IdentityProof = {
    nonce: string;
    audience: string;
    deployment: string;
    kind: 'owner' | 'agent';
    name: string;
    identity: string;
    registration: Hex;
    key: Address;
    generation: string;
    expiresAt: number;
};
export function normalizeIdentityName(value: string): string {
    if (value.length > 255)
        throw new Error('ENS name is too long');
    const name = normalize(value.trim());
    if (!name.endsWith('.eth') || name.split('.').length < 2 || name.split('.').length > 10)
        throw new Error('Use an ENSv2 .eth name on the selected deployment');
    return name;
}
export function identityProofMessage(proof: IdentityProof): string {
    return ['Wayleave portable identity v1', 'Authentication only. This grants no spending authority.', JSON.stringify(proof)].join('\n');
}
export function identityFingerprint(value: unknown): Hex { return keccak256(toHex(JSON.stringify(value))); }
export async function authenticatePortableAgent(input: {
    gateway: string;
    identity: string;
    name: string;
    signMessage: (message: string) => Promise<Hex>;
    expectedKey?: Address;
    fetch?: typeof fetch;
}) {
    const request = input.fetch ?? fetch;
    const gateway = new URL(input.gateway);
    if (gateway.protocol !== 'https:' && !(gateway.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(gateway.hostname)))
        throw new Error('Use HTTPS or a loopback gateway');
    if (gateway.search || gateway.hash || gateway.username || gateway.password)
        throw new Error('Use an explicit gateway base URL');
    const origin = gateway.origin;
    const base = gateway.toString().replace(/\/$/, '');
    const send = async (path: string, body: unknown) => {
        const response = await request(`${base}/identity/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000) }).catch(() => { throw new Error('Portable identity gateway is unavailable'); });
        const data = await response.json();
        if (!response.ok)
            throw new Error('Portable authentication failed at the configured gateway');
        return data;
    };
    const challenge = await send('challenge', { deployment: portableIdentityDeployment, kind: 'agent', name: input.name, identity: input.identity });
    // Never follow an endpoint record or forward credentials to another origin.
    if (challenge.proof?.audience !== origin || challenge.proof.kind !== 'agent' || challenge.proof.deployment !== portableIdentityDeployment || challenge.proof.name !== normalizeIdentityName(input.name) || challenge.proof.identity !== normalizeIdentityName(input.identity) || challenge.proof.expiresAt <= Date.now() / 1000 || challenge.proof.expiresAt > Date.now() / 1000 + 300 || !/^[a-f0-9]{64}$/.test(challenge.proof.nonce) || (input.expectedKey && challenge.proof.key?.toLowerCase() !== input.expectedKey.toLowerCase()) || challenge.message !== identityProofMessage(challenge.proof))
        throw new Error('Unexpected gateway challenge');
    const result = await send('verify', { nonce: challenge.proof.nonce, signature: await input.signMessage(challenge.message) });
    if (!/^[a-f0-9]{64}$/.test(result.token) || result.session?.kind !== 'agent' || result.session?.audience !== origin || result.session?.membership?.name !== normalizeIdentityName(input.name) || result.session?.identity?.name !== normalizeIdentityName(input.identity) || result.session?.identity?.deployment !== portableIdentityDeployment || !Number.isSafeInteger(result.session?.expiresAt) || result.session.expiresAt <= Date.now() / 1000)
        throw new Error('Invalid portable identity session');
    return result;
}
