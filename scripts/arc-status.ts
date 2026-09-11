/** Read-only compatibility preflight. Never deploys, signs, or broadcasts. */
import { createPublicClient, erc20Abi, http } from 'viem';
import { arcTestnet, sepolia } from 'viem/chains';
import { arcCctpRoute as route, cctpAbi } from '../packages/sdk/src/cctp';
import { arcDeploymentFromEnv } from '../apps/gateway/src/arc-chain';

const source = createPublicClient({ chain: arcTestnet, transport: http(process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io') });
const destination = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com') });
const ids = await Promise.all([source.getChainId(), destination.getChainId()]);
if (ids[0] !== route.sourceChainId || ids[1] !== route.destinationChainId) throw new Error('Testnet RPC chain mismatch');
const deployment = arcDeploymentFromEnv();
const evidence = await Promise.all([
  source.readContract({ address: route.sourceToken, abi: erc20Abi, functionName: 'decimals' }),
  destination.readContract({ address: route.destinationToken, abi: erc20Abi, functionName: 'decimals' }),
  source.readContract({ address: route.messageTransmitter, abi: cctpAbi, functionName: 'localDomain' }),
  destination.readContract({ address: route.messageTransmitter, abi: cctpAbi, functionName: 'localDomain' }),
]);
if (evidence[0] !== 6 || evidence[1] !== 6 || evidence[2] !== 26 || evidence[3] !== 0) throw new Error('Circle route metadata mismatch');
const contracts = deployment ? await Promise.all(Object.entries(deployment).map(async ([name,address]) => ({ name, address, hasCode: ![undefined, '0x'].includes(await source.getCode({ address })) }))) : [];
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), route, contracts, deploymentConfigured: !!deployment, routeMetadataVerified: true, kernelExecutionVerified: false, passkeyVerified: false, realTransferVerified: false, remaining: ['Verify pinned Kernel and EntryPoint runtime compatibility on Arc', 'Record deployed NFAT contracts and owner-approved source/destination transactions'] }, null, 2));
