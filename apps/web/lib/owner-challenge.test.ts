import { expect, test } from 'bun:test';
import { createOwnerChallengeCache } from './owner-challenge';

const now = Date.parse('2026-09-10T12:00:00Z');
const challenge = {
  nonce: 'a'.repeat(64),
  domain: 'www.wayleave.xyz',
  uri: 'https://www.wayleave.xyz',
  statement: 'Sign in to Wayleave.',
  issuedAt: new Date(now).toISOString(),
  expirationTime: new Date(now + 300_000).toISOString(),
};

test('preparation and signing share one challenge without a second fetch', async () => {
  let calls = 0;
  const cache = createOwnerChallengeCache(
    async () => {
      calls++;
      return challenge;
    },
    () => now,
  );
  const [first, concurrent] = await Promise.all([cache.get(), cache.get()]);
  expect(first).toBe(concurrent);
  expect(await cache.get()).toBe(first);
  expect(calls).toBe(1);
  cache.clear();
  await cache.get();
  expect(calls).toBe(2);
});

test('refreshes a challenge approaching expiry', async () => {
  let time = now;
  let calls = 0;
  const cache = createOwnerChallengeCache(
    async () => ({
      ...challenge,
      nonce: String(++calls),
      expirationTime: new Date(time + 300_000).toISOString(),
    }),
    () => time,
  );
  expect((await cache.get()).nonce).toBe('1');
  time += 270_000;
  expect((await cache.get()).nonce).toBe('2');
});

test('a failed preparation can be retried', async () => {
  let calls = 0;
  const cache = createOwnerChallengeCache(
    async () => {
      if (++calls === 1) throw new Error('offline');
      return challenge;
    },
    () => now,
  );
  await expect(cache.get()).rejects.toThrow('offline');
  expect(await cache.get()).toBe(challenge);
});

test('clearing an in-flight challenge prevents it from being cached again', async () => {
  let finish!: (value: typeof challenge) => void;
  let calls = 0;
  const cache = createOwnerChallengeCache(
    () => {
      calls++;
      if (calls === 1)
        return new Promise((resolve) => {
          finish = resolve;
        });
      return Promise.resolve({ ...challenge, nonce: 'new' });
    },
    () => now,
  );
  const stale = cache.get();
  cache.clear();
  await cache.get();
  finish(challenge);
  await stale;
  expect((await cache.get()).nonce).toBe('new');
});
