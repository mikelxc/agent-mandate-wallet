import { createPublicClient, http, encodeFunctionData, hashTypedData, decodeEventLog, formatEther, type Hex, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { sepoliaDeployment as d, entryPointAbi, kernelAccountFactoryAbi, mockUSDCAbi, ownerPayment, ownerAuthorization, packedPair } from '../packages/sdk/src';

if (!Bun.argv.includes('--broadcast')) throw new Error('Pass --broadcast to run the authorized Sepolia test. Uses local encrypted keystore.');
const rpc = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const client = createPublicClient({ chain: sepolia, transport: http(rpc) });
if (await client.getChainId() !== 11155111) throw new Error('Sepolia only');
const owner: Address = '0x96B0D15128748cE191B79c75560Ed93695788865';
const recipient: Address = '0x000000000000000000000000000000000000bEEF';
const credentials = ['--keystore', '.secrets/sepolia-deployer.json', '--password-file', '.secrets/sepolia-deployer.password'];
async function cast(args: string[]) {
  const p = Bun.spawn(['cast', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code) throw new Error(`Cast failed: ${err}`);
  return out.trim();
}
const transactions: Hex[] = [];
async function send(to: Address, data: Hex, value = '0') {
  const hash = await cast(['send', to, data, '--value', value, '--rpc-url', rpc, '--chain', '11155111', ...credentials, '--async']) as Hex;
  transactions.push(hash);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${hash}`);
  console.log(`Confirmed ${hash}`);
  return receipt;
}
if ((await client.readContract({ address: d.registry, abi: kernelAccountFactoryAbi, functionName: 'ownerOf', args: [1n] })).toLowerCase() !== owner.toLowerCase()) throw new Error('Unexpected demo owner');
await send(d.token, encodeFunctionData({ abi: mockUSDCAbi, functionName: 'mint', args: [owner, 100_000_000n] }));
try {
await send(d.token, encodeFunctionData({ abi: mockUSDCAbi, functionName: 'approve', args: [d.demoAccount, 8_000_000n] }));
await send(d.entryPoint, encodeFunctionData({ abi: entryPointAbi, functionName: 'depositTo', args: [d.demoAccount] }), '0.005ether');
const before = await client.readContract({ address: d.token, abi: mockUSDCAbi, functionName: 'balanceOf', args: [recipient] });
const ownerBefore = await client.readContract({ address: d.token, abi: mockUSDCAbi, functionName: 'balanceOf', args: [owner] });
  const fees = await client.estimateFeesPerGas();
  const maxFee = fees.maxFeePerGas * 2n;
  if (maxFee > 50_000_000_000n) throw new Error('Test fee ceiling exceeded');
  const op = {
    sender: d.demoAccount,
    nonce: await client.readContract({ address: d.entryPoint, abi: entryPointAbi, functionName: 'getNonce', args: [d.demoAccount, 0n] }),
    initCode: '0x' as Hex,
    callData: ownerPayment(d.token, owner, recipient, 3_000_000n),
    accountGasLimits: packedPair(300_000n, 300_000n), preVerificationGas: 60_000n,
    gasFees: packedPair(fees.maxPriorityFeePerGas, maxFee), paymasterAndData: '0x' as Hex, signature: '0x' as Hex,
  };
  const actionHash = await client.readContract({ address: d.entryPoint, abi: entryPointAbi, functionName: 'getUserOpHash', args: [op] });
  const epoch = await client.readContract({ address: d.registry, abi: kernelAccountFactoryAbi, functionName: 'ownershipEpoch', args: [1n] });
  op.signature = await cast(['wallet', 'sign', '--no-hash', hashTypedData(ownerAuthorization(sepolia.id, d.validator, d.demoAccount, 1n, epoch, actionHash)), ...credentials]) as Hex;
  await client.simulateContract({ address: d.entryPoint, abi: entryPointAbi, functionName: 'handleOps', args: [[op], owner], account: owner });
  const receipt = await send(d.entryPoint, encodeFunctionData({ abi: entryPointAbi, functionName: 'handleOps', args: [[op], owner] }));
  const event = receipt.logs.filter(l => l.address.toLowerCase() === d.entryPoint.toLowerCase()).flatMap(log => {
    try { const e = decodeEventLog({ abi: entryPointAbi, ...log }); return e.eventName === 'UserOperationEvent' && e.args.userOpHash === actionHash ? [e.args] : []; } catch { return []; }
  })[0];
  if (!event?.success) throw new Error('UserOperation failed inside a successful transaction');
  const after = await client.readContract({ address: d.token, abi: mockUSDCAbi, functionName: 'balanceOf', args: [recipient] });
  const ownerAfter = await client.readContract({ address: d.token, abi: mockUSDCAbi, functionName: 'balanceOf', args: [owner] });
  if (after - before !== 3_000_000n || ownerBefore - ownerAfter !== 3_000_000n) throw new Error('Incorrect balance effects');
  await Bun.write('deployments/sepolia-smoke.json', JSON.stringify({ chainId: sepolia.id, account: d.demoAccount, owner, recipient, userOpHash: actionHash, transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString(), success: true, ownerDecrease: '3000000', recipientIncrease: '3000000', token: d.token, transactions }, null, 2) + '\n');
} finally {
  const revoked = await send(d.token, encodeFunctionData({ abi: mockUSDCAbi, functionName: 'approve', args: [d.demoAccount, 0n] }));
  const remaining = await client.readContract({ address: d.token, abi: mockUSDCAbi, functionName: 'allowance', args: [owner, d.demoAccount] });
  if (remaining !== 0n) throw new Error('Allowance was not revoked');
  console.log(`Allowance revoked: ${revoked.transactionHash}`);
}
console.log(`Owner-balance payment verified; allowance revoked. Deployer balance ${formatEther(await client.getBalance({ address: owner }))} test ETH.`);
