import { describe, expect, test } from 'bun:test';
import { decodeAbiParameters, decodeFunctionData, type Address } from 'viem';
import { passkeyCreationCall, passkeyRegistrationChallenge, encodePasskeyProof } from './passkey';
import { passkeyAccountFactoryAbi } from './generated/PasskeyAccountFactory';

const factory = '0x1111111111111111111111111111111111111111' as Address;
const account = '0x2222222222222222222222222222222222222222' as Address;
const key = { x: 1n, y: 2n };
describe('passkey registration transport', () => {
  test('normalizes high-s browser assertions and rejects invalid scalars', () => {
    const order = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
    expect(encodePasskeyProof('0x', '{}', 1n, 3n, order - 4n, true)).toBe(encodePasskeyProof('0x', '{}', 1n, 3n, 4n, true));
    expect(() => encodePasskeyProof('0x', '{}', 1n, 0n, 4n, true)).toThrow('Invalid P256');
  });
  test('challenge binds chain, factory, key, account, label and deadline', () => {
    const digest = passkeyRegistrationChallenge(11155111, factory, key, account, 'alice', 100n);
    for (const changed of [
      passkeyRegistrationChallenge(1, factory, key, account, 'alice', 100n),
      passkeyRegistrationChallenge(11155111, account, key, account, 'alice', 100n),
      passkeyRegistrationChallenge(11155111, factory, { ...key, x: 3n }, account, 'alice', 100n),
      passkeyRegistrationChallenge(11155111, factory, key, factory, 'alice', 100n),
      passkeyRegistrationChallenge(11155111, factory, key, account, 'other', 100n),
      passkeyRegistrationChallenge(11155111, factory, key, account, 'alice', 101n),
    ]) expect(changed).not.toBe(digest);
  });
  test('proof preserves the signed JSON bytes and selects the passkey overload', () => {
    const json = '{"type":"webauthn.get","challenge":"test","origin":"https://example.com"}';
    const proof = encodePasskeyProof('0x000102', json, 1n, 3n, 4n, true);
    expect(decodeAbiParameters([{ type: 'bytes' }, { type: 'string' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bool' }], proof))
      .toEqual(['0x000102', json, 1n, 3n, 4n, true]);
    const call = passkeyCreationCall(factory, key, 'alice', 100n, proof);
    expect(call.to).toBe(factory);
    expect(decodeFunctionData({ abi: passkeyAccountFactoryAbi, data: call.data })).toEqual({
      functionName: 'createAccount', args: [key, 'alice', 100n, proof],
    });
  });
});
