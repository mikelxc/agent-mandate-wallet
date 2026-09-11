/** Read-only verification and public evidence export for the authorized Arc deployment. */
import { createHash } from 'node:crypto';
import { createPublicClient, decodeEventLog, formatUnits, getAddress, hashDomain, http, keccak256, zeroAddress, type Address, type Hex } from 'viem';
import { arcTestnet } from 'viem/chains';
import { entryPointAbi, kernelAccountFactoryAbi, nFTOwnerValidatorAbi, kernelAbi } from '../packages/sdk/src';
import { arcCctpRoute } from '../packages/sdk/src/cctp';
const c = createPublicClient({ chain: arcTestnet, transport: http(process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io') });
if (await c.getChainId() !== 5042002) throw new Error('Arc Testnet only');
const broadcast = await Bun.file('packages/contracts/broadcast/DeployKernelArc.s.sol/5042002/run-latest.json').json();
const expectedOwner = '0x96B0D15128748cE191B79c75560Ed93695788865' as Address;
const entryPoint = '0x433709009B8330FDa32311DF1C2AFA402eD8D009' as Address;
const epCode = await c.getCode({ address: entryPoint });
if (!epCode || keccak256(epCode) !== '0x4912531cbb1316092e1c25164d8fd78bdb94374d990be9575246e6d98e38a25a') throw new Error('Unexpected EntryPoint runtime');
const contracts = [];
let totalGas = 0n, totalCost = 0n;
for (const tx of broadcast.transactions) {
  const receipt = await c.getTransactionReceipt({ hash: tx.hash });
  if (receipt.status !== 'success' || receipt.from.toLowerCase() !== expectedOwner.toLowerCase()) throw new Error('Unexpected deployment receipt');
  totalGas += receipt.gasUsed; totalCost += receipt.gasUsed * receipt.effectiveGasPrice;
  const code = await c.getCode({ address: tx.contractAddress });
  if (!code || code === '0x') throw new Error('Missing contract runtime');
  let runtimeMatchesArtifact: boolean | undefined;
  if (tx.transactionType === 'CREATE') {
    const artifact = await Bun.file(`packages/contracts/out/${tx.contractName}.sol/${tx.contractName}.json`).json();
    let expected = artifact.deployedBytecode.object.slice(2), actual = code.slice(2);
    for (const references of Object.values(artifact.deployedBytecode.immutableReferences ?? {})) for (const item of references as { start: number; length: number }[]) {
      const start = item.start * 2, end = start + item.length * 2;
      expected = expected.slice(0,start) + '0'.repeat(item.length*2) + expected.slice(end);
      actual = actual.slice(0,start) + '0'.repeat(item.length*2) + actual.slice(end);
    }
    // Solc metadata compilation targets can differ between a script build and a later standalone artifact build.
    // Compare all executable bytes, masking only declared immutables and the trailing CBOR metadata.
    const stripMetadata = (hex: string) => { const length = Number.parseInt(hex.slice(-4),16); if (!Number.isFinite(length) || length < 2 || length > 4096) throw new Error('Invalid compiler metadata'); return hex.slice(0,hex.length-(length+2)*2); };
    runtimeMatchesArtifact = stripMetadata(actual) === stripMetadata(expected);
    if (!runtimeMatchesArtifact) throw new Error(`Runtime differs from compiled artifact: ${tx.contractName}`);
  }
  contracts.push({ name: tx.contractName, type: tx.transactionType, address: getAddress(tx.contractAddress), transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString(), codeHash: keccak256(code), gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString(), runtimeMatchesArtifactExcludingImmutablesAndMetadata: runtimeMatchesArtifact });
}
if (contracts.length !== 6) throw new Error('Expected five deployments and one account creation');
const named = (name: string) => contracts.find(tx => tx.name === name && tx.type === 'CREATE')!;
const registry = named('KernelAccountFactory').address, validator = named('NFTOwnerValidator').address;
const account = await c.readContract({ address: registry, abi: kernelAccountFactoryAbi, functionName: 'accountOf', args: [1n] });
const [owner, epoch, binding, identityAdapter, root, code, balance] = await Promise.all([
  c.readContract({ address: registry, abi: kernelAccountFactoryAbi, functionName: 'ownerOf', args: [1n] }),
  c.readContract({ address: registry, abi: kernelAccountFactoryAbi, functionName: 'ownershipEpoch', args: [1n] }),
  c.readContract({ address: validator, abi: nFTOwnerValidatorAbi, functionName: 'bindings', args: [account] }),
  c.readContract({ address: registry, abi: kernelAccountFactoryAbi, functionName: 'identityAdapter' }),
  c.readContract({ address: account, abi: kernelAbi, functionName: 'root' }),
  c.getCode({ address: account }),
  c.getBalance({ address: expectedOwner }),
]);
if (owner.toLowerCase() !== expectedOwner.toLowerCase() || binding[0].toLowerCase() !== registry.toLowerCase() || binding[1] !== 1n || identityAdapter !== zeroAddress || root.toLowerCase() !== `0x01${validator.slice(2)}`.toLowerCase() || !code || code === '0x') throw new Error('NFAT authority binding mismatch');
const domainTypes = { EIP712Domain: [{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}] };
const sepoliaClient = createPublicClient({transport:http('https://ethereum-sepolia-rpc.publicnode.com')});
const sepoliaCode = await sepoliaClient.getCode({address:entryPoint});
const sepDomain = hashDomain({domain:{name:'ERC4337',version:'1',chainId:11155111,verifyingContract:entryPoint},types:domainTypes});
const arcDomain = hashDomain({domain:{name:'ERC4337',version:'1',chainId:5042002,verifyingContract:entryPoint},types:domainTypes});
const canonicalMatch = sepoliaCode?.replaceAll((11155111).toString(16).padStart(64,'0'),(5042002).toString(16).padStart(64,'0')).replaceAll(sepDomain.slice(2),arcDomain.slice(2)) === epCode;
if (!canonicalMatch || keccak256(sepoliaCode!) !== '0x280d5c7c0de94b512401eb9c4b0ef0436275ff03627aad0ce1f93ab1627187a0') throw new Error('EntryPoint canonical comparison failed');
const sourcePaths = ['packages/contracts/script/DeployKernelArc.s.sol','packages/contracts/src/KernelAccountFactory.sol','packages/contracts/src/NFTOwnerValidator.sol'];
const sourceSHA256 = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path,createHash('sha256').update(await Bun.file(path).text()).digest('hex')])));
const manifest = {
  chainId: 5042002, network: 'Arc Testnet', checkedAt: new Date().toISOString(), deployer: expectedOwner,
  kernelRevision: 'f2a84a332ec5a722e7e95a0d64601905c3c87fe9',
  entryPoint: {address:entryPoint,version:'0.9.0',codeHash:keccak256(epCode),existingDeployment:true,canonicalSepoliaRuntimeMatchedExceptChainIdAndDomainSeparator:canonicalMatch},
  token: {address:arcCctpRoute.sourceToken,symbol:'USDC',decimals:6,nativeDecimals:18,nativeAndTokenShareBalance:true,circleIssued:true},
  circle: {sourceDomain:26,destinationDomain:6,destinationChainId:84532,tokenMessenger:arcCctpRoute.tokenMessenger,messageTransmitter:arcCctpRoute.messageTransmitter},
  contracts,
  demoAccount:{address:account,tokenId:'1',label:'arc-research',owner,epoch:epoch.toString(),rootValidator:validator,identityAdapter,transactionHash:contracts[5].transactionHash,blockNumber:contracts[5].blockNumber,codeHash:keccak256(code)},
  gas:{totalGasUsed:totalGas.toString(),paidNativeUSDC:formatUnits(totalCost,18),deployerBalanceAfterUSDC:formatUnits(balance,18),maxFeePerGas:'42000000000'},
  verification:{deploymentReceipts:true,runtimeArtifactMatchExcludingImmutablesAndMetadata:true,nfatOwnershipAndValidatorBinding:true,canonicalEntryPointRuntime:true,cctpTransfer:false,passkey:false,explorerSourceVerification:false},
  compiler:{version:'0.8.33',evmVersion:'prague',viaIR:true,optimizerRuns:200}, sourceSHA256,
};
await Bun.write('deployments/arc-testnet.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({manifest:'deployments/arc-testnet.json',registry,validator,kernel:named('KernelUUPS').address,account,gas:manifest.gas,verification:manifest.verification},null,2));
