import { encodeAbiParameters, encodeFunctionData, hashTypedData, keccak256, stringToHex, type Address, type Hex } from 'viem';
import { passkeyAccountFactoryAbi } from './generated/PasskeyAccountFactory';

export type PasskeyPublicKey = { x: bigint; y: bigint };
export const passkeyRegistrationTypes = {
  RegisterPasskey: [
    { name: 'x', type: 'uint256' }, { name: 'y', type: 'uint256' },
    { name: 'account', type: 'address' }, { name: 'labelHash', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** Read accountAddress(key) from the factory first. Use this digest as the raw WebAuthn challenge, not personal_sign. */
export function passkeyRegistrationChallenge(chainId: number, factory: Address, key: PasskeyPublicKey, account: Address, label: string, deadline: bigint): Hex {
  return hashTypedData({
    domain: { name: 'Wayleave Passkey Factory', version: '1', chainId, verifyingContract: factory },
    types: passkeyRegistrationTypes, primaryType: 'RegisterPasskey',
    message: { ...key, account, labelHash: keccak256(stringToHex(label)), deadline },
  });
}

const P256_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

/** Preserve signed bytes; normalize the decoded DER signature to the validator's required low-s form. */
export function encodePasskeyProof(authenticatorData: Hex, clientDataJSON: string, responseTypeLocation: bigint, r: bigint, s: bigint, usePrecompiled: boolean): Hex {
  if (r <= 0n || r >= P256_ORDER || s <= 0n || s >= P256_ORDER) throw new Error('Invalid P256 signature scalar');
  const lowS = s > P256_ORDER / 2n ? P256_ORDER - s : s;
  return encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'string' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }],
    [authenticatorData, clientDataJSON, responseTypeLocation, r, lowS, usePrecompiled],
  );
}

/** A funded relayer submits this call; it receives no ownership or spending authority. */
export function passkeyCreationCall(factory: Address, key: PasskeyPublicKey, label: string, deadline: bigint, proof: Hex) {
  return { to: factory, data: encodeFunctionData({ abi: passkeyAccountFactoryAbi, functionName: 'createAccount', args: [key, label, deadline, proof] }) };
}
