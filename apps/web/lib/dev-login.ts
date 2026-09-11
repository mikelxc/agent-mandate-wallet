import { hexToString, isAddress, isAddressEqual, type Address, type Hex } from 'viem';
import { createSiweMessage } from 'viem/siwe';

export const devLoginStatement = 'Sign in to Mandate. This grants no spending authority.';
const maxLifetimeSeconds = 300;

export function validateDevLoginMessage(
  messageHex: string,
  requestedAddress: string,
  expectedOwner: Address,
  expectedOrigin: string,
  now = Math.floor(Date.now() / 1000),
): string {
  if (!/^0x[0-9a-f]+$/i.test(messageHex) || messageHex.length % 2 !== 0)
    throw new Error('Invalid local sign-in message.');
  if (!isAddress(requestedAddress) || !isAddressEqual(requestedAddress, expectedOwner))
    throw new Error('Unexpected signer.');
  const origin = new URL(expectedOrigin);
  if (
    origin.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    throw new Error('Local sign-in origin required.');
  let message: string;
  try {
    message = hexToString(messageHex as Hex);
  } catch {
    throw new Error('Invalid local sign-in message.');
  }
  const lines = message.split('\n');
  const nonce = lines.find((line) => line.startsWith('Nonce: '))?.slice(7);
  const issuedAt = lines.find((line) => line.startsWith('Issued At: '))?.slice(11);
  const expirationTime = lines.find((line) => line.startsWith('Expiration Time: '))?.slice(17);
  if (!nonce || !/^[a-f0-9]{64}$/.test(nonce)) throw new Error('Invalid local sign-in nonce.');
  const issued = Date.parse(issuedAt ?? '');
  const expiration = Date.parse(expirationTime ?? '');
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expiration) ||
    issued < (now - maxLifetimeSeconds) * 1000 ||
    issued > (now + 60) * 1000 ||
    expiration <= now * 1000 ||
    expiration > issued + maxLifetimeSeconds * 1000
  )
    throw new Error('Local sign-in message is expired or outside the allowed time window.');
  const expected = createSiweMessage({
    address: requestedAddress as Address,
    chainId: 11155111,
    domain: origin.host,
    uri: origin.origin,
    version: '1',
    nonce,
    statement: devLoginStatement,
    issuedAt: new Date(issued),
    expirationTime: new Date(expiration),
  });
  if (message !== expected) throw new Error('Local sign-in message does not match this site.');
  return message;
}
