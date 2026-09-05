import { encodeFunctionData, encodePacked, erc20Abi, toHex, type Address, type Hex } from 'viem';
import { kernelAbi } from './generated/Kernel';
import { kernelAccountFactoryAbi } from './generated/KernelAccountFactory';

export const authorizationTypes = {
  AccountAuthorization: [
    { name: 'account', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'epoch', type: 'uint256' },
    { name: 'actionHash', type: 'bytes32' },
  ],
} as const;

export function ownerAuthorization(chainId: number, validator: Address, account: Address, tokenId: bigint, epoch: bigint, actionHash: Hex) {
  return {
    domain: { name: 'Mandate NFT Owner Validator', version: '1', chainId, verifyingContract: validator },
    types: authorizationTypes,
    primaryType: 'AccountAuthorization' as const,
    message: { account, tokenId, epoch, actionHash },
  };
}

export function packedPair(high: bigint, low: bigint): Hex {
  if ([high, low].some(n => n < 0n || n >= 1n << 128n)) throw new Error('Value exceeds uint128');
  return toHex((high << 128n) | low, { size: 32 });
}

export function ownerPayment(token: Address, owner: Address, recipient: Address, amount: bigint): Hex {
  if (amount <= 0n) throw new Error('Amount must be positive');
  return encodeFunctionData({ abi: kernelAbi, functionName: 'execute', args: [toHex(0, { size: 32 }),
    encodePacked(['address', 'uint256', 'bytes'], [token, 0n,
      encodeFunctionData({ abi: erc20Abi, functionName: 'transferFrom', args: [owner, recipient, amount] })]),
  ] });
}

/** Only send atomically through the OWNER's wallet. A generic multicall changes msg.sender. */
export function setupCalls(registry: Address, token: Address, label: string, id: bigint, predicted: Address, allowance: bigint) {
  if (allowance <= 0n) throw new Error('Allowance must be positive');
  return [
    { to: registry, data: encodeFunctionData({ abi: kernelAccountFactoryAbi, functionName: 'createAccountChecked', args: [label, id] }) },
    { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [predicted, allowance] }) },
  ];
}
