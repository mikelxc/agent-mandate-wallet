import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  toHex,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from 'viem';
import {
  ensV2HackathonDeployment as ens,
  hackathonSepolia,
} from '../packages/sdk/src/index.ts';

if (!Bun.argv.includes('--broadcast')) {
  throw new Error(
    'Pass --broadcast to register on the authorized Sepolia ENSv2 deployment.',
  );
}

const label = (process.env.ENS_LABEL ?? 'wayleave').toLowerCase();
if (!label || label.includes('.') || !/^[a-z0-9-]+$/.test(label)) {
  throw new Error('ENS_LABEL must be a single lowercase .eth label');
}

const rpc =
  process.env.SEPOLIA_RPC_URL ??
  'https://ethereum-sepolia-rpc.publicnode.com';
const owner: Address = '0x96B0D15128748cE191B79c75560Ed93695788865';
const paymentToken: Address =
  '0xcbfd80f74375c54e545af34788ff465f96f66f05';
const duration = 31_536_000n;
const credentials = [
  '--keystore',
  '.secrets/sepolia-deployer.json',
  '--password-file',
  '.secrets/sepolia-deployer.password',
];

const registrarAbi = parseAbi([
  'function isAvailable(string label) view returns (bool)',
  'function MIN_COMMITMENT_AGE() view returns (uint256)',
  'function makeCommitment(string label,address owner,bytes32 secret,address subregistry,address resolver,uint64 duration,bytes32 referrer) view returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function getRegisterPrice(string label,uint64 duration,address paymentToken) view returns (uint256 base,uint256 premium)',
  'function register(string label,address owner,bytes32 secret,address subregistry,address resolver,uint64 duration,address paymentToken,bytes32 referrer) returns (uint256 tokenId)',
]);
const tokenAbi = parseAbi([
  'function mint(address to,uint256 amount)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner,address spender) view returns (uint256)',
]);
const registryAbi = parseAbi([
  'function getOwner(uint256 anyId) view returns (address)',
  'function getExpiry(uint256 anyId) view returns (uint64)',
]);

const client = createPublicClient({
  chain: hackathonSepolia,
  transport: http(rpc),
});

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

const transactions: Array<{ purpose: string; hash: Hex }> = [];
async function send(purpose: string, to: Address, data: Hex) {
  const hash = (await cast([
    'send',
    to,
    data,
    '--rpc-url',
    rpc,
    '--chain',
    String(hackathonSepolia.id),
    ...credentials,
    '--async',
  ])) as Hex;
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error(`${purpose} reverted: ${hash}`);
  }
  transactions.push({ purpose, hash });
  console.log(`${purpose}: ${hash}`);
  return receipt;
}

if ((await client.getChainId()) !== 11_155_111) {
  throw new Error('Refusing to register outside Sepolia');
}
if (
  !(await client.readContract({
    address: ens.ethRegistrar,
    abi: registrarAbi,
    functionName: 'isAvailable',
    args: [label],
  }))
) {
  throw new Error(`${label}.eth is not available`);
}

const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
const commitment = await client.readContract({
  address: ens.ethRegistrar,
  abi: registrarAbi,
  functionName: 'makeCommitment',
  args: [
    label,
    owner,
    secret,
    zeroAddress,
    zeroAddress,
    duration,
    zeroHash,
  ],
});
const commitReceipt = await send(
  'ENS commitment confirmed',
  ens.ethRegistrar,
  encodeFunctionData({
    abi: registrarAbi,
    functionName: 'commit',
    args: [commitment],
  }),
);

const initialPrice = await client.readContract({
  address: ens.ethRegistrar,
  abi: registrarAbi,
  functionName: 'getRegisterPrice',
  args: [label, duration, paymentToken],
});
const initialTotal = initialPrice[0] + initialPrice[1];
const balance = await client.readContract({
  address: paymentToken,
  abi: tokenAbi,
  functionName: 'balanceOf',
  args: [owner],
});
if (balance < initialTotal) {
  await send(
    'Test USDC minted',
    paymentToken,
    encodeFunctionData({
      abi: tokenAbi,
      functionName: 'mint',
      args: [owner, initialTotal - balance],
    }),
  );
}

const minimumAge = await client.readContract({
  address: ens.ethRegistrar,
  abi: registrarAbi,
  functionName: 'MIN_COMMITMENT_AGE',
});
const commitBlock = await client.getBlock({
  blockNumber: commitReceipt.blockNumber,
});
const revealAt = commitBlock.timestamp + minimumAge;
while ((await client.getBlock()).timestamp < revealAt) {
  const latest = await client.getBlock();
  console.log(`Reveal opens in ${revealAt - latest.timestamp}s`);
  await Bun.sleep(6_000);
}

const price = await client.readContract({
  address: ens.ethRegistrar,
  abi: registrarAbi,
  functionName: 'getRegisterPrice',
  args: [label, duration, paymentToken],
});
const total = price[0] + price[1];
await send(
  'Exact registrar allowance granted',
  paymentToken,
  encodeFunctionData({
    abi: tokenAbi,
    functionName: 'approve',
    args: [ens.ethRegistrar, total],
  }),
);

let registerReceipt;
try {
  registerReceipt = await send(
    'ENS registration confirmed',
    ens.ethRegistrar,
    encodeFunctionData({
      abi: registrarAbi,
      functionName: 'register',
      args: [
        label,
        owner,
        secret,
        zeroAddress,
        zeroAddress,
        duration,
        paymentToken,
        zeroHash,
      ],
    }),
  );
} finally {
  const allowance = await client.readContract({
    address: paymentToken,
    abi: tokenAbi,
    functionName: 'allowance',
    args: [owner, ens.ethRegistrar],
  });
  if (allowance !== 0n) {
    await send(
      'Registrar allowance revoked',
      paymentToken,
      encodeFunctionData({
        abi: tokenAbi,
        functionName: 'approve',
        args: [ens.ethRegistrar, 0n],
      }),
    );
  }
}

if (!registerReceipt) throw new Error('Registration did not produce a receipt');
const anyId = BigInt(keccak256(toHex(label)));
const [registeredOwner, expiry, remainingAllowance] = await Promise.all([
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
    address: paymentToken,
    abi: tokenAbi,
    functionName: 'allowance',
    args: [owner, ens.ethRegistrar],
  }),
]);
if (registeredOwner.toLowerCase() !== owner.toLowerCase()) {
  throw new Error(`Unexpected registered owner: ${registeredOwner}`);
}
if (remainingAllowance !== 0n) {
  throw new Error(`Registrar allowance remains nonzero: ${remainingAllowance}`);
}

const evidence = {
  deployment: 'ETHOnline 2026 ENSv2 hackathon',
  chainId: hackathonSepolia.id,
  name: `${label}.eth`,
  label,
  owner: registeredOwner,
  registry: ens.ethRegistry,
  registrar: ens.ethRegistrar,
  universalResolver: ens.universalResolver,
  paymentToken,
  price: total.toString(),
  duration: duration.toString(),
  expiry: expiry.toString(),
  registrationTransaction: registerReceipt.transactionHash,
  registrationBlock: registerReceipt.blockNumber.toString(),
  remainingRegistrarAllowance: remainingAllowance.toString(),
  transactions,
};
await Bun.write(
  `deployments/ensv2-${label}-sepolia.json`,
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify(evidence, null, 2));
