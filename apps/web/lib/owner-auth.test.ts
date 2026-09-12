import { expect, test } from 'bun:test';
import { ownerAuth } from './owner-auth';
import { getAddress } from 'viem';
import { parseSiweMessage } from 'viem/siwe';

test('formats a lowercase WalletConnect account as a checksummed Sepolia SIWE message', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';
  const args = {
    address: `did:pkh:eip155:11155111:${address}`,
    chainId: 11155111,
    domain: 'www.wayleave.xyz',
    uri: 'https://www.wayleave.xyz',
    nonce: 'a'.repeat(64),
    version: '1' as const,
    iat: '2026-09-12T12:00:00.000Z',
    exp: '2026-09-12T12:05:00.000Z',
    statement: 'Sign in to Wayleave. This grants no spending authority.',
  };
  const parsed = parseSiweMessage(ownerAuth.createMessage(args));
  expect(parsed.address).toBe(getAddress(address));
  expect(parsed.chainId).toBe(11155111);
  expect(parsed.domain).toBe(args.domain);
  expect(parsed.uri).toBe(args.uri);
  expect(parsed.nonce).toBe(args.nonce);
  expect(parsed.expirationTime?.toISOString()).toBe(args.exp);
  expect(() => ownerAuth.createMessage({ ...args, chainId: 5042002 })).toThrow('Switch your wallet to Sepolia');
});

test('network switches retain the login, but another wallet cannot reuse it', async () => {
  const original = globalThis.fetch;
  const address = '0x1111111111111111111111111111111111111111';
  globalThis.fetch = (async () => Response.json({ address, chainId: 11155111 })) as unknown as typeof fetch;
  try {
    const auth = ownerAuth.mapToSIWX();
    expect(await auth.getSessions('eip155:5042002', address)).toHaveLength(1);
    expect(await auth.getSessions('eip155:11155111', address)).toHaveLength(1);
    expect(await auth.getSessions('eip155:5042002', '0x2222222222222222222222222222222222222222')).toHaveLength(0);
    expect(auth.signOutOnDisconnect).toBe(true);
  } finally { globalThis.fetch = original; }
});
