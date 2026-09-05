import { describe, expect, test } from 'bun:test';
import { decodeFunctionData, erc20Abi, hashTypedData, type Address } from 'viem';
import { kernelAbi } from './generated/Kernel';
import { kernelAccountFactoryAbi } from './generated/KernelAccountFactory';
import { ownerAuthorization, ownerPayment, packedPair, setupCalls } from './kernel';
const registry: Address = '0x0000000000000000000000000000000000000001';
const token: Address = '0x0000000000000000000000000000000000000002';
const owner: Address = '0x0000000000000000000000000000000000000003';
const account: Address = '0x0000000000000000000000000000000000000004';
describe('Kernel wire format', () => {
  test('setup targets the predicted instance and guards its ID', () => {
    const calls = setupCalls(registry, token, 'research', 7n, account, 8_000_000n);
    expect(calls.map(c => c.to)).toEqual([registry, token]);
    expect(decodeFunctionData({ abi: kernelAccountFactoryAbi, data: calls[0].data })).toEqual({ functionName: 'createAccountChecked', args: ['research', 7n] });
    expect(decodeFunctionData({ abi: erc20Abi, data: calls[1].data })).toEqual({ functionName: 'approve', args: [account, 8_000_000n] });
  });
  test('single execution pulls the exact owner amount', () => {
    const decoded = decodeFunctionData({ abi: kernelAbi, data: ownerPayment(token, owner, registry, 3n) });
    expect(decoded.functionName).toBe('execute');
    const packed = decoded.args![1] as `0x${string}`;
    expect(packed.slice(0, 42)).toBe(token);
    expect(BigInt(`0x${packed.slice(42, 106)}`)).toBe(0n);
    expect(decodeFunctionData({ abi: erc20Abi, data: `0x${packed.slice(106)}` })).toEqual({ functionName: 'transferFrom', args: [owner, registry, 3n] });
  });
  test('authorization binds account, chain, and ownership epoch', () => {
    const hash = `0x${'11'.repeat(32)}` as const;
    const digest = (chain: number, a: Address, epoch: bigint) => hashTypedData(ownerAuthorization(chain, registry, a, 1n, epoch, hash));
    const base = digest(11155111, account, 1n);
    expect(digest(1, account, 1n)).not.toBe(base);
    expect(digest(11155111, owner, 1n)).not.toBe(base);
    expect(digest(11155111, account, 2n)).not.toBe(base);
    expect(() => packedPair(1n << 128n, 0n)).toThrow();
  });
});
