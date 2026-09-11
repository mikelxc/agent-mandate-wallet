import { describe, expect, test } from 'bun:test';
import { createSiweMessage } from 'viem/siwe';
import { stringToHex } from 'viem';
import { validateDevLoginMessage, devLoginStatement } from './dev-login';

const owner = '0x96B0D15128748cE191B79c75560Ed93695788865' as const;
const origin = 'http://localhost:3020';
const now = 1_800_000_000;
const issuedAt = new Date((now - 10) * 1000);
const expirationTime = new Date((now + 290) * 1000);
const nonce = 'a'.repeat(64);
const message = createSiweMessage({
  address: owner,
  chainId: 11155111,
  domain: 'localhost:3020',
  uri: origin,
  version: '1',
  nonce,
  statement: devLoginStatement,
  issuedAt,
  expirationTime,
});

test('accepts the exact local Sepolia ownership message', () => {
  expect(validateDevLoginMessage(stringToHex(message), owner, owner, origin, now)).toBe(message);
});

describe('rejects unsafe local sign-in requests', () => {
  test.each([
    ['wrong owner', owner, '0x1111111111111111111111111111111111111111', origin, message],
    ['wrong origin', owner, owner, 'http://localhost:3000', message],
    ['extra text', owner, owner, origin, `${message}\nextra`],
    ['wrong statement', owner, owner, origin, message.replace(devLoginStatement, 'Sign in.')],
  ])('%s', (_name, requested, expected, requestedOrigin, raw) => {
    expect(() =>
      validateDevLoginMessage(stringToHex(raw), requested, expected as any, requestedOrigin, now),
    ).toThrow();
  });

  test('rejects stale messages', () => {
    const stale = createSiweMessage({
      address: owner,
      chainId: 11155111,
      domain: 'localhost:3020',
      uri: origin,
      version: '1',
      nonce,
      statement: devLoginStatement,
      issuedAt: new Date((now - 301) * 1000),
      expirationTime: new Date((now - 1) * 1000),
    });
    expect(() => validateDevLoginMessage(stringToHex(stale), owner, owner, origin, now)).toThrow();
  });
});
