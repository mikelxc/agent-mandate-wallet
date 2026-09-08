import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import {
  agentEnsName,
  ensV2HackathonDeployment as ens,
  hackathonSepolia,
  kernelAccountFactoryAbi,
} from '../packages/sdk/src/index.ts';

if (!Bun.argv.includes('--broadcast')) {
  throw new Error('Pass --broadcast to create the authorized Sepolia proof account.');
}

const rpc =
  process.env.SEPOLIA_RPC_URL ??
  'https://ethereum-sepolia-rpc.publicnode.com';
const owner: Address = '0x96B0D15128748cE191B79c75560Ed93695788865';
const resolver: Address = '0x44974A0CD84A563BC599Af7ff573B85137B172CB';
const userRegistry: Address = '0xBBfc3F1f529593ca1aa4D727121Ad4896e66fA34';
const identityAdapter: Address =
  '0x03AEcb257c931A5eB18F18cCAD9f6d9B584ad44b';
const productFactory: Address =
  '0xf0C862D40eE1E9637a6B8634E75ebc86aeCCa3dE';
const resolverImplementation: Address =
  '0xa9d3814AB151BF6E37A427432795371a8361614e';
const registryImplementation: Address =
  '0x47B442d0CF617c41CAbAFf5f02f44DD1e5f72546';
const label = process.env.AGENT_LABEL ?? 'research-desk';
const name = agentEnsName(label);

const client = createPublicClient({
  chain: hackathonSepolia,
  transport: http(rpc),
});
const credentials = [
  '--keystore',
  '.secrets/sepolia-deployer.json',
  '--password-file',
  '.secrets/sepolia-deployer.password',
];
const registryAbi = parseAbi([
  'function getStatus(uint256 anyId) view returns (uint8)',
  'function getOwner(uint256 anyId) view returns (address)',
  'function getResolver(string label) view returns (address)',
  'function getSubregistry(string label) view returns (address)',
  'function hasRootRoles(uint256 roleBitmap,address account) view returns (bool)',
]);
const adapterAbi = parseAbi([
  'function factory() view returns (address)',
  'function addr(bytes32 node) view returns (address)',
]);
const verifiableFactoryAbi = parseAbi([
  'function verifyContract(address proxy) view returns (address implementation)',
]);

async function cast(args: string[]) {
  const process = Bun.spawn(['cast', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (code !== 0) throw new Error(`Cast failed: ${stderr.trim()}`);
  return stdout.trim();
}

if ((await client.getChainId()) !== 11_155_111) {
  throw new Error('Refusing to create an account outside Sepolia');
}
const labelhash = BigInt(keccak256(toHex(label)));
const [
  parentResolver,
  parentSubregistry,
  parentAddress,
  deployedResolverImplementation,
  deployedRegistryImplementation,
  adapterFactory,
  adapterAuthorized,
  childStatus,
] = await Promise.all([
  client.readContract({
    address: ens.ethRegistry,
    abi: registryAbi,
    functionName: 'getResolver',
    args: ['wayleave'],
  }),
  client.readContract({
    address: ens.ethRegistry,
    abi: registryAbi,
    functionName: 'getSubregistry',
    args: ['wayleave'],
  }),
  client.getEnsAddress({ name: ens.parentName }),
  client.readContract({
    address: ens.verifiableFactory,
    abi: verifiableFactoryAbi,
    functionName: 'verifyContract',
    args: [resolver],
  }),
  client.readContract({
    address: ens.verifiableFactory,
    abi: verifiableFactoryAbi,
    functionName: 'verifyContract',
    args: [userRegistry],
  }),
  client.readContract({
    address: identityAdapter,
    abi: adapterAbi,
    functionName: 'factory',
  }),
  client.readContract({
    address: userRegistry,
    abi: registryAbi,
    functionName: 'hasRootRoles',
    args: [1n, identityAdapter],
  }),
  client.readContract({
    address: userRegistry,
    abi: registryAbi,
    functionName: 'getStatus',
    args: [labelhash],
  }),
]);

if (parentResolver.toLowerCase() !== resolver.toLowerCase()) {
  throw new Error(`Unexpected parent resolver: ${parentResolver}`);
}
if (parentSubregistry.toLowerCase() !== userRegistry.toLowerCase()) {
  throw new Error(`Unexpected parent subregistry: ${parentSubregistry}`);
}
if (parentAddress?.toLowerCase() !== owner.toLowerCase()) {
  throw new Error(`wayleave.eth resolved to ${parentAddress}`);
}
if (
  deployedResolverImplementation.toLowerCase() !==
    resolverImplementation.toLowerCase() ||
  deployedRegistryImplementation.toLowerCase() !==
    registryImplementation.toLowerCase()
) {
  throw new Error('ENSv2 proxy provenance check failed');
}
if (adapterFactory.toLowerCase() !== productFactory.toLowerCase()) {
  throw new Error(`Adapter is bound to ${adapterFactory}`);
}
if (!adapterAuthorized) throw new Error('Adapter lacks ROLE_REGISTRAR');
if (childStatus !== 0) throw new Error(`${name} is already registered`);

const [tokenId, predictedAccount] = await client.readContract({
  address: productFactory,
  abi: kernelAccountFactoryAbi,
  functionName: 'nextAccountAddress',
});
await client.simulateContract({
  account: owner,
  address: productFactory,
  abi: kernelAccountFactoryAbi,
  functionName: 'createAccountChecked',
  args: [label, tokenId],
});
const calldata = encodeFunctionData({
  abi: kernelAccountFactoryAbi,
  functionName: 'createAccountChecked',
  args: [label, tokenId],
});
const transactionHash = (await cast([
  'send',
  productFactory,
  calldata,
  '--rpc-url',
  rpc,
  '--chain',
  String(hackathonSepolia.id),
  ...credentials,
  '--async',
])) as Hex;
const receipt = await client.waitForTransactionReceipt({ hash: transactionHash });
if (receipt.status !== 'success') {
  throw new Error(`Proof account creation reverted: ${transactionHash}`);
}

const [nfatOwner, account, childOwner, childResolver, resolvedAddress] =
  await Promise.all([
    client.readContract({
      address: productFactory,
      abi: kernelAccountFactoryAbi,
      functionName: 'ownerOf',
      args: [tokenId],
    }),
    client.readContract({
      address: productFactory,
      abi: kernelAccountFactoryAbi,
      functionName: 'accountOf',
      args: [tokenId],
    }),
    client.readContract({
      address: userRegistry,
      abi: registryAbi,
      functionName: 'getOwner',
      args: [labelhash],
    }),
    client.readContract({
      address: userRegistry,
      abi: registryAbi,
      functionName: 'getResolver',
      args: [label],
    }),
    client.getEnsAddress({ name }),
  ]);

if (nfatOwner.toLowerCase() !== owner.toLowerCase()) {
  throw new Error(`Unexpected NFAT owner: ${nfatOwner}`);
}
if (account.toLowerCase() !== predictedAccount.toLowerCase()) {
  throw new Error(`Unexpected account: ${account}`);
}
if (childOwner.toLowerCase() !== identityAdapter.toLowerCase()) {
  throw new Error(`Unexpected ENS child owner: ${childOwner}`);
}
if (childResolver.toLowerCase() !== identityAdapter.toLowerCase()) {
  throw new Error(`Unexpected ENS child resolver: ${childResolver}`);
}
if (resolvedAddress?.toLowerCase() !== account.toLowerCase()) {
  throw new Error(`${name} resolved to ${resolvedAddress}, expected ${account}`);
}

const evidence = {
  deployment: 'ETHOnline 2026 ENSv2 hackathon',
  chainId: hackathonSepolia.id,
  parentName: ens.parentName,
  parentOwner: owner,
  parentAddress,
  resolver,
  resolverImplementation,
  userRegistry,
  registryImplementation,
  identityAdapter,
  identityAdapterRoles: ['ROLE_REGISTRAR'],
  productFactory,
  agentName: name,
  nfatTokenId: tokenId.toString(),
  nfatOwner,
  account,
  resolvedAddress,
  creationTransaction: transactionHash,
  creationBlock: receipt.blockNumber.toString(),
};
await Bun.write(
  'deployments/wayleave-namespace-sepolia.json',
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify(evidence, null, 2));
