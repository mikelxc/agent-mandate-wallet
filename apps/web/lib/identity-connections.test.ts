import { expect, test } from 'bun:test';
import { identityConnections } from './identity-connections';

test('missing or expired identity proof is optional, including the gateway 400 response', async () => {
  for (const status of [400, 401]) {
    expect(
      await identityConnections(
        Response.json({ error: 'Identity session required' }, { status }),
      ),
    ).toEqual({ connections: [], verificationRequired: true });
  }
});
test('verified identities retain their connections', async () => {
  expect(
    await identityConnections(Response.json({ connections: [{ id: 'a' }] })),
  ).toEqual({ connections: [{ id: 'a' }], verificationRequired: false });
});
test('real service and permission failures are not hidden', async () => {
  for (const status of [400, 403, 503]) {
    await expect(
      identityConnections(Response.json({ error: 'Unavailable' }, { status })),
    ).rejects.toThrow('Unavailable');
  }
  await expect(identityConnections(Response.json({}))).rejects.toThrow(
    'invalid agent connections',
  );
});
