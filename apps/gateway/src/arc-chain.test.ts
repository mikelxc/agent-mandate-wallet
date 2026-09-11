import { expect, test } from 'bun:test';
import { encodeAbiParameters, encodeEventTopics, type TransactionReceipt } from 'viem';
import { entryPointAbi, cctpAbi, arcCctpRoute } from '@mandate/sdk';
import { testCctpIntent as intent, testCctpMessage } from '../../../packages/sdk/src/cctp.fixtures';
import { arcDeploymentFromEnv, verifyCctpSourceReceipt } from './arc-chain';
import type { Prepared } from './chain';
const hash=`0x${'ab'.repeat(32)}` as const;
const d={entryPoint:intent.fundingOwner};
const prepared={actionHash:hash} as Prepared;
function receipt(success=true): Pick<TransactionReceipt,'status'|'logs'|'blockNumber'|'transactionHash'> {
  const logs=[
    {address:d.entryPoint,topics:encodeEventTopics({abi:entryPointAbi,eventName:'UserOperationEvent',args:{userOpHash:hash,sender:intent.account,paymaster:'0x0000000000000000000000000000000000000000'}}),data:encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[0n,success,100n,100n])},
    {address:arcCctpRoute.messageTransmitter,topics:encodeEventTopics({abi:cctpAbi,eventName:'MessageSent'}),data:encodeAbiParameters([{type:'bytes'}],[testCctpMessage()])},
  ] as TransactionReceipt['logs'];
  return {status:'success',logs,blockNumber:1n,transactionHash:hash};
}
test('source receipt requires matching successful inner operation and unique valid Circle message',()=>{
  expect(verifyCctpSourceReceipt(d,intent,prepared,receipt()).transactionHash).toBe(hash);
  expect(()=>verifyCctpSourceReceipt(d,intent,prepared,receipt(false))).toThrow('Inner source operation failed');
  const duplicate=receipt();duplicate.logs.push(duplicate.logs[1]);
  expect(()=>verifyCctpSourceReceipt(d,intent,prepared,duplicate)).toThrow('unique');
  const spoofed=receipt();spoofed.logs[1].address=intent.account;
  expect(()=>verifyCctpSourceReceipt(d,intent,prepared,spoofed)).toThrow('unique');
  expect(()=>verifyCctpSourceReceipt(d,intent,{actionHash:`0x${'cd'.repeat(32)}`} as Prepared,receipt())).toThrow('Matching');
});
test('Arc deployment config fails closed on partial/non-address manifests',()=>{
  expect(arcDeploymentFromEnv({})).toBeUndefined();
  expect(()=>arcDeploymentFromEnv({ARC_REGISTRY:intent.account})).toThrow('ARC_VALIDATOR');
});
