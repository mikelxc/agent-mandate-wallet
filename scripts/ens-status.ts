import {
  createPublicClient,
  http,
  keccak256,
  toHex,
  zeroAddress,
} from 'viem';
import {
  ensV2HackathonDeployment as ens,
  hackathonSepolia,
} from '../packages/sdk/src/index.ts';

const name = process.env.ENS_NAME ?? ens.parentName;
const label = name.endsWith('.eth') ? name.slice(0, -4) : name;
if (!label || label.includes('.')) {
  throw new Error('ENS_NAME must be a second-level .eth name');
}

const client = createPublicClient({
  chain: hackathonSepolia,
  transport: http(
    process.env.SEPOLIA_RPC_URL ??
      'https://ethereum-sepolia-rpc.publicnode.com',
  ),
});

const registryAbi = [
  {
    type: 'function',
    name: 'getSubregistry',
    stateMutability: 'view',
    inputs: [{ type: 'string', name: 'label' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'getResolver',
    stateMutability: 'view',
    inputs: [{ type: 'string', name: 'label' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'getOwner',
    stateMutability: 'view',
    inputs: [{ type: 'uint256', name: 'anyId' }],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'getExpiry',
    stateMutability: 'view',
    inputs: [{ type: 'uint256', name: 'anyId' }],
    outputs: [{ type: 'uint64' }],
  },
] as const;

const anyId = BigInt(keccak256(toHex(label)));
const [owner, expiry, resolver, subregistry, address] = await Promise.all([
  client.readContract({
    address: ens.ethRegistry,
    abi: registryAbi,
    functionName: 'getOwner',
    args: [anyId],
  }),
  client.readContract({
    address: ens.ethRegistry,
    abi: registryAbi,
    functionName: 'getExpiry',
    args: [anyId],
  }),
  client.readContract({
    address: ens.ethRegistry,
    abi: registryAbi,
    functionName: 'getResolver',
    args: [label],
  }),
  client.readContract({
    address: ens.ethRegistry,
    abi: registryAbi,
    functionName: 'getSubregistry',
    args: [label],
  }),
  client.getEnsAddress({ name }).catch(() => null),
]);

console.log(
  JSON.stringify(
    {
      deployment: 'ETHOnline 2026 ENSv2 hackathon',
      chainId: hackathonSepolia.id,
      name,
      registered:
        owner !== zeroAddress && expiry > BigInt(Math.floor(Date.now() / 1000)),
      owner,
      expiry: expiry.toString(),
      resolver,
      subregistry,
      address,
      universalResolver: ens.universalResolver,
    },
    null,
    2,
  ),
);
