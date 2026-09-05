import { createPublicClient, createWalletClient, http, decodeEventLog, keccak256, toHex, zeroAddress, type Address, type Hex } from 'viem';
import { foundry } from 'viem/chains';
import { accountFactoryAbi, operatingAccountAbi, mockUSDCAbi } from '../packages/sdk/src';
const transport = http('http://127.0.0.1:8545');
const publicClient = createPublicClient({chain:foundry,transport});
for (let attempt=0; ; attempt++) {
  try { if (await publicClient.getChainId() !== 31337) throw new Error('Anvil chain 31337 required'); break; }
  catch (error) { if (attempt >= 10) throw error; await Bun.sleep(300); }
}
const accounts = await publicClient.request({method:'eth_accounts'});
const [owner, agent, recipient, nextOwner] = accounts;
if (!nextOwner) throw new Error('Four unlocked Anvil accounts required');
const wallet = createWalletClient({chain:foundry,transport,account:owner});
async function confirmed(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({hash});
  if (receipt.status !== 'success') throw new Error(`Reverted: ${hash}`);
  return receipt;
}
const factoryArtifact = await Bun.file('packages/contracts/out/AccountFactory.sol/AccountFactory.json').json();
const tokenArtifact = await Bun.file('packages/contracts/out/MockUSDC.sol/MockUSDC.json').json();
const factory = (await confirmed(await wallet.deployContract({abi:accountFactoryAbi,bytecode:factoryArtifact.bytecode.object,args:[zeroAddress]}))).contractAddress!;
const token = (await confirmed(await wallet.deployContract({abi:mockUSDCAbi,bytecode:tokenArtifact.bytecode.object}))).contractAddress!;
const created = await confirmed(await wallet.writeContract({address:factory,abi:accountFactoryAbi,functionName:'createAccount',args:['research-demo']}));
let account: Address | undefined;
for (const log of created.logs) { try { const event=decodeEventLog({abi:accountFactoryAbi,data:log.data,topics:log.topics}); if(event.eventName === 'AccountCreated') account=event.args.account; } catch {} }
if (!account) throw new Error('No created account');
await confirmed(await wallet.writeContract({address:token,abi:mockUSDCAbi,functionName:'mint',args:[account,20_000_000n]}));
const block=await publicClient.getBlock();
await confirmed(await wallet.writeContract({address:account,abi:operatingAccountAbi,functionName:'grant',args:[agent,token,recipient,5_000_000n,20_000_000n,block.timestamp+86400n]}));
const requestId=keccak256(toHex('invoice-1'));
await confirmed(await wallet.writeContract({account:agent,address:account,abi:operatingAccountAbi,functionName:'pay',args:[0n,requestId,token,recipient,3_000_000n]}));
const balance=await publicClient.readContract({address:token,abi:mockUSDCAbi,functionName:'balanceOf',args:[recipient]});
if(balance !== 3_000_000n) throw new Error('Incorrect recipient balance');
async function mustDeny(request: Hex) {
  let denied=false;
  try { await publicClient.simulateContract({account:agent,address:account!,abi:operatingAccountAbi,functionName:'pay',args:[0n,request,token,recipient,3_000_000n]}); }
  catch(error) { const message=String(error); if(!message.includes('DuplicateRequest') && !message.includes('PolicyDenied')) throw error; denied=true; }
  if(!denied) throw new Error('Expected execution denial');
}
await mustDeny(requestId);
await confirmed(await wallet.writeContract({address:factory,abi:accountFactoryAbi,functionName:'proposeHandover',args:[1n,nextOwner]}));
await confirmed(await wallet.writeContract({account:nextOwner,address:factory,abi:accountFactoryAbi,functionName:'acceptHandover',args:[1n]}));
await mustDeny(keccak256(toHex('invoice-2')));
console.log(JSON.stringify({factory,token,account,checks:['deploy','create','fund','grant','pay','replay rejected','handover invalidates grant']},null,2));
