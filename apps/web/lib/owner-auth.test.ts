import { expect, test } from 'bun:test';
import { ownerAuth } from './owner-auth';

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
