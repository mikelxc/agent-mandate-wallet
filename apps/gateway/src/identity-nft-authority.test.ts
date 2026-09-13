import { expect, test } from 'bun:test';
import { custom, decodeFunctionData, encodeFunctionResult, zeroAddress, verifyMessage, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ensV2HackathonDeployment, wayleaveSepoliaDeployment as deployment, sepoliaDeployment, kernelAccountFactoryAbi, nFTOwnerValidatorAbi, portableIdentityDeployment } from '@mandate/sdk';
import { createIdentityResolver, identityRegistryAbi, namingAdapterAbi } from './identity-resolver';
import { createIdentityAuth } from './identity-auth';
import { Store } from './store';

const owner = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const stranger = privateKeyToAccount(`0x${'22'.repeat(32)}`);
const account = '0x3333333333333333333333333333333333333333';
function fixture(overrides: Record<string, unknown> = {}) {
    const state = { owner: owner.address, epoch: 1n, ...overrides };
    const blocks: string[] = [];
    const transport = custom({ request: async ({ method, params }: any) => {
        if (method === 'eth_chainId') return '0xaa36a7';
        if (method === 'eth_getBlockByNumber') return { number: '0xa', timestamp: '0x3e8', hash: `0x${'11'.repeat(32)}`, transactions: [] };
        if (method !== 'eth_call') throw new Error(`Unexpected RPC ${method}`);
        blocks.push(params[1]);
        const to = params[0].to.toLowerCase();
        const isParent = to === ensV2HackathonDeployment.ethRegistry.toLowerCase();
        const abi = to === deployment.identityAdapter.toLowerCase() ? namingAdapterAbi
            : to === deployment.productFactory.toLowerCase() ? kernelAccountFactoryAbi
            : to === sepoliaDeployment.validator.toLowerCase() ? nFTOwnerValidatorAbi : identityRegistryAbi;
        const call = decodeFunctionData({ abi, data: params[0].data as Hex });
        const values: Record<string, unknown> = {
            getOwner: isParent ? owner.address : deployment.identityAdapter,
            getExpiry: 9000n, getTokenId: 1n, getResource: 1n,
            getResolver: deployment.identityAdapter,
            getSubregistry: isParent ? deployment.userRegistry : zeroAddress, hasRoles: false,
            addr: account, factory: deployment.productFactory, ensRegistry: deployment.userRegistry,
            identityAdapter: deployment.identityAdapter, bindings: [deployment.productFactory, 1n],
            accountOf: account, labelOf: 'desk', ownerOf: state.owner, ownershipEpoch: state.epoch,
            ...state,
        };
        return encodeFunctionResult({ abi: abi as any, functionName: call.functionName, result: values[call.functionName] as any });
    } });
    return { resolver: createIdentityResolver('http://unused', () => 1000, transport), state, blocks };
}
test('pinned adapter identity uses current NFT owner and includes ownership epoch at one block', async () => {
    const s = fixture();
    const first = await s.resolver.discover('desk.wayleave.eth');
    expect(first.controller).toBe(owner.address);
    expect(first.authority).toMatchObject({ kind: 'wayleave-nft-owner', registryOwner: deployment.identityAdapter, account, epoch: '1' });
    expect(first.canSetSubregistry).toBe(false);
    expect(new Set(s.blocks)).toEqual(new Set(['0xa']));
    s.state.epoch = 3n; // Transfer away and back must still invalidate old sessions.
    expect((await s.resolver.discover(first.name)).registration).not.toBe(first.registration);
    await expect(s.resolver.membership(first.name, `agent.${first.name}`)).rejects.toThrow('owner-issued agent tokens');
});
test('rejects mismatched factory, adapter, validator binding, name, account, and invalid ownership', async () => {
    for (const bad of [
        { factory: stranger.address }, { ensRegistry: stranger.address }, { identityAdapter: stranger.address },
        { getResolver: stranger.address }, { bindings: [stranger.address, 1n] }, { bindings: [deployment.productFactory, 0n] },
        { accountOf: stranger.address }, { labelOf: 'someone-else' }, { ownerOf: zeroAddress }, { ownershipEpoch: 0n }, { addr: zeroAddress },
    ]) await expect(fixture(bad).resolver.discover('desk.wayleave.eth')).rejects.toThrow();
});
test('ordinary ENS owners do not gain NFT authority through address records', async () => {
    const identity = await fixture({ getOwner: stranger.address }).resolver.discover('desk.wayleave.eth');
    expect(identity.controller).toBe(stranger.address);
    expect(identity.authority).toBeUndefined();
});
test('NFT owner authenticates exact challenge; wrong owner and handover invalidate access', async () => {
    const s = fixture();
    const store = new Store(':memory:');
    const auth = createIdentityAuth({ db: store.db, now: () => 1000, audience: 'https://gateway.example', resolver: {
        ...s.resolver, verify: (address, message, signature) => verifyMessage({ address, message, signature }),
    } });
    const c = await auth.challenge({ deployment: portableIdentityDeployment, kind: 'owner', name: 'desk.wayleave.eth' });
    await expect(auth.verify(c.proof.nonce, await stranger.signMessage({ message: c.message }))).rejects.toThrow('signature');
    const result = await auth.verify(c.proof.nonce, await owner.signMessage({ message: c.message }));
    expect((await auth.authenticate(result.token)).identity.controller).toBe(owner.address);
    s.state.epoch = 3n;
    await expect(auth.authenticate(result.token)).rejects.toThrow('changed');
    const stale = await auth.challenge({ deployment: portableIdentityDeployment, kind: 'owner', name: 'desk.wayleave.eth' });
    s.state.owner = stranger.address;
    await expect(auth.verify(stale.proof.nonce, await owner.signMessage({ message: stale.message }))).rejects.toThrow('changed');
});
