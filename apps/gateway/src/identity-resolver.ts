import { IdentityError } from './identity-error';
import { createPublicClient, http, keccak256, parseAbi, toHex, zeroAddress, type Address, type Hex, type Transport } from 'viem';
import { namehash } from 'viem/ens';
import { ensV2HackathonDeployment, hackathonSepolia, normalizeIdentityName, portableIdentityDeployment, identityFingerprint, type PortableIdentity, type PortableMembership } from '@mandate/sdk';
export const identityRegistryAbi = parseAbi([
    'function getOwner(uint256) view returns (address)',
    'function getExpiry(uint256) view returns (uint64)',
    'function getTokenId(uint256) view returns (uint256)',
    'function getResource(uint256) view returns (uint256)',
    'function getResolver(string) view returns (address)',
    'function getSubregistry(string) view returns (address)',
    'function hasRoles(uint256,uint256,address) view returns (bool)',
]);
export const agentRegistryAbi = parseAbi([
    'function schemaVersion() view returns (uint256)',
    'function parentRegistry() view returns (address)',
    'function parentId() view returns (uint256)',
    'function parentResource() view returns (uint256)',
    'function parentNode() view returns (bytes32)',
    'function controller() view returns (address)',
    'function getAgent(string) view returns (address,uint64,uint64,uint8)',
    'function enroll(string,address,uint64,uint8)',
    'function remove(string)',
]);
export interface IdentityResolver {
    discover(name: string): Promise<PortableIdentity>;
    membership(identity: string, name: string): Promise<PortableMembership>;
    verify(address: Address, message: string, signature: Hex): Promise<boolean>;
}
/** No authorization cache: every use reads a single latest block; RPC errors fail closed. */
export function createIdentityResolver(rpcUrl: string, now: () => number = () => Math.floor(Date.now() / 1000), transport?: Transport): IdentityResolver {
    const client = createPublicClient({ chain: hackathonSepolia, transport: transport ?? http(rpcUrl, { timeout: 10000, retryCount: 1 }) });
    async function discoverAt(input: string, blockNumber: bigint): Promise<PortableIdentity> {
        const name = normalizeIdentityName(input);
        const labels = name.split('.').slice(0, -1).reverse();
        let registry: Address = ensV2HackathonDeployment.ethRegistry;
        const ancestors: unknown[] = [];
        let result: PortableIdentity | undefined;
        for (const label of labels) {
            if (registry === zeroAddress)
                throw new IdentityError('This name has no configured child registry');
            const id = BigInt(keccak256(toHex(label)));
            const [controller, expiry, tokenId, resource, resolver, subregistry] = await Promise.all([
                client.readContract({ address: registry, abi: identityRegistryAbi, functionName: 'getOwner', args: [id], blockNumber }), client.readContract({ address: registry, abi: identityRegistryAbi, functionName: 'getExpiry', args: [id], blockNumber }), client.readContract({ address: registry, abi: identityRegistryAbi, functionName: 'getTokenId', args: [id], blockNumber }), client.readContract({ address: registry, abi: identityRegistryAbi, functionName: 'getResource', args: [id], blockNumber }),
                client.readContract({ address: registry, abi: identityRegistryAbi, functionName: 'getResolver', args: [label], blockNumber }),
                client.readContract({ address: registry, abi: identityRegistryAbi, functionName: 'getSubregistry', args: [label], blockNumber }),
            ]);
            if (controller === zeroAddress || expiry <= BigInt(now()))
                throw new IdentityError('ENSv2 name is unregistered or expired');
            ancestors.push([registry.toLowerCase(), controller.toLowerCase(), tokenId.toString(), resource.toString(), subregistry.toLowerCase()]);
            const canSetSubregistry = await client.readContract({ address: registry, abi: identityRegistryAbi, functionName: 'hasRoles', args: [id, 1n << 20n, controller], blockNumber });
            result = { name, deployment: portableIdentityDeployment, chainId: 11155111, registry, controller, resolver, subregistry, registration: identityFingerprint(ancestors), expiresAt: Math.min(Number(expiry), result?.expiresAt ?? Number.MAX_SAFE_INTEGER), canSetSubregistry };
            registry = subregistry;
        }
        return result!;
    }
    async function freshBlock() {
        if (await client.getChainId() !== 11155111)
            throw new IdentityError('ENS identity RPC must be Sepolia');
        const block = await client.getBlock();
        if (Number(block.timestamp) < now() - 120 || Number(block.timestamp) > now() + 30)
            throw new IdentityError('ENS identity RPC is stale');
        return block.number;
    }
    return {
        async discover(name) { return discoverAt(name, await freshBlock()); },
        async membership(input, agentInput) {
            const blockNumber = await freshBlock();
            const identity = await discoverAt(input, blockNumber);
            const name = normalizeIdentityName(agentInput);
            const suffix = `.${identity.name}`;
            const label = name.slice(0, -suffix.length);
            if (!name.endsWith(suffix) || !label || label.includes('.'))
                throw new IdentityError('Agent must be a direct child of the identity');
            if (identity.subregistry === zeroAddress)
                throw new IdentityError('No portable agent registry is attached; enrollment can be added later');
            const address = identity.subregistry;
            const [version, parent, parentId, parentResource, parentNode, controller, agent] = await Promise.all([
                client.readContract({ address, abi: agentRegistryAbi, functionName: 'schemaVersion', blockNumber }),
                client.readContract({ address, abi: agentRegistryAbi, functionName: 'parentRegistry', blockNumber }),
                client.readContract({ address, abi: agentRegistryAbi, functionName: 'parentId', blockNumber }),
                client.readContract({ address, abi: agentRegistryAbi, functionName: 'parentResource', blockNumber }),
                client.readContract({ address, abi: agentRegistryAbi, functionName: 'parentNode', blockNumber }),
                client.readContract({ address, abi: agentRegistryAbi, functionName: 'controller', blockNumber }),
                client.readContract({ address, abi: agentRegistryAbi, functionName: 'getAgent', args: [label], blockNumber }),
            ]);
            const expectedId = BigInt(keccak256(toHex(identity.name.split('.')[0])));
            const resource = await client.readContract({ address: identity.registry, abi: identityRegistryAbi, functionName: 'getResource', args: [expectedId], blockNumber });
            if (version !== 1n || parent.toLowerCase() !== identity.registry.toLowerCase() || parentId !== expectedId || parentResource !== resource || parentNode !== namehash(identity.name) || controller.toLowerCase() !== identity.controller.toLowerCase())
                throw new IdentityError('Unsupported or stale portable agent registry');
            const [key, generation, expiry, bits] = agent;
            if (key === zeroAddress || expiry <= BigInt(now()) || bits < 1 || bits > 3)
                throw new IdentityError('Agent enrollment is removed or expired');
            return { identity, name, key, generation: generation.toString(), expiresAt: Math.min(Number(expiry), identity.expiresAt), scopes: [...(bits & 1 ? ['read' as const] : []), ...(bits & 2 ? ['propose_payment' as const] : [])] };
        },
        async verify(address, message, signature) { await freshBlock(); return client.verifyMessage({ address, message, signature }); },
    };
}
