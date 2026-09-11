import { describe, expect, test } from 'bun:test';
import { decodeAbiParameters, decodeFunctionData, encodePacked, padHex, zeroHash, type Hex } from 'viem';
import { arcCctpRoute as r, cctpAbi, cctpIntentHash, cctpMintCall, cctpOwnerPayment, cctpPaymentSummary, parseCctpIntent, parseCctpMessage, type CctpIntent } from './cctp';
import { kernelAbi } from './generated/Kernel';
import { testCctpIntent, testCctpMessage } from './cctp.fixtures';
describe('Arc CCTP exact payments', () => {
  test('rejects mismatched domains, mainnet, token, negative fees, excessive fees, extra calldata', () => {
    for (const change of [{destinationDomain:11155111},{sourceChainId:1},{recipient:'0x0000000000000000000000000000000000000000'},{sourceToken:testCctpIntent.recipient},{maxFee:'1000000'},{maxFee:'-1'},{callData:'0x'},{amount:'01'}]) expect(() => parseCctpIntent({...testCctpIntent,...change})).toThrow();
    expect(cctpPaymentSummary(testCctpIntent).minimumMerchantReceipt).toBe('999000');
  });
  test('rejects prior Base route without reinterpreting approved terms', () => {
    expect(() => parseCctpIntent({...testCctpIntent,destinationChainId:84532,destinationDomain:6,destinationToken:'0x036CbD53842c5426634e7929541eC2318f3dCF7e'})).toThrow();
    expect(() => parseCctpIntent({...testCctpIntent,destinationDomain:6})).toThrow();
    const message = testCctpMessage(true);
    const oldDomain = `${message.slice(0,18)}00000006${message.slice(26)}` as Hex;
    expect(() => parseCctpMessage(oldDomain,testCctpIntent,true)).toThrow('does not match');
  });
  test('canonical intent and economic calldata bind changes', () => {
    expect(cctpIntentHash(testCctpIntent)).toBe(cctpIntentHash({...testCctpIntent}));
    expect(cctpOwnerPayment(testCctpIntent)).not.toBe(cctpOwnerPayment({...testCctpIntent,maxFee:'999'}));
    expect(cctpIntentHash(testCctpIntent)).not.toBe(cctpIntentHash({...testCctpIntent,businessReference:'invoice-2'}));
  });
  test('batch uses atomic mode and exact allowance with no hook', () => {
    const decoded = decodeFunctionData({ abi: kernelAbi, data:cctpOwnerPayment(testCctpIntent) });
    expect(decoded.functionName).toBe('execute');
    if (decoded.functionName !== 'execute') throw new Error();
    expect(decoded.args[0]).toBe(`0x01${'00'.repeat(31)}`);
    const [calls] = decodeAbiParameters([{type:'tuple[]',components:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'callData',type:'bytes'}]}],decoded.args[1]);
    expect(calls).toHaveLength(5);
    expect(calls.every(call => call.value === 0n)).toBeTrue();
    const burn = decodeFunctionData({abi:cctpAbi,data:calls[3].callData});
    expect(burn.functionName).toBe('depositForBurn');
    expect(burn.args).toEqual([1000000n,0,padHex(testCctpIntent.recipient,{size:32}),r.sourceToken,zeroHash,1000n,2000]);
  });
  test('attestation correlates immutable wire fields while allowing Circle-populated values', () => {
    const source = parseCctpMessage(testCctpMessage(),testCctpIntent);
    const attested = parseCctpMessage(testCctpMessage(true),testCctpIntent,true);
    expect(attested.fingerprint).toBe(source.fingerprint);
    expect(attested.merchantAmount).toBe('999500');
    expect(() => parseCctpMessage(testCctpMessage(),testCctpIntent,true)).toThrow();
    expect(() => parseCctpMessage(testCctpMessage(true),{...testCctpIntent,recipient:testCctpIntent.account},true)).toThrow();
    expect(() => parseCctpMessage(`${testCctpMessage()}00`,testCctpIntent)).toThrow();
    expect(cctpMintCall(testCctpMessage(true),`0x${'ab'.repeat(65)}`,testCctpIntent).chainId).toBe(11155111);
  });
});
