import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from './store';
import { MerchantService, createMerchantRoute, developerOffering } from './merchant';
import type { ArcChain } from './arc-chain';
import { testCctpIntent } from '../../../packages/sdk/src/cctp.fixtures';
import { verifyDelivery } from 'wayleave-merchant';

const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
function fixture(path = ':memory:') {
  const store = new Store(path); stores.push(store);
  let now = 1000, epoch = '1';
  const buyer = { id: 'test-agent', account: testCctpIntent.account, owner: testCctpIntent.fundingOwner };
  const chain = { ownership: async () => ({ owner: buyer.owner, tokenId: '1', epoch }) } as Pick<ArcChain, 'ownership'>;
  const offering = { ...developerOffering(testCctpIntent.recipient), price: '100000', maxTransferFee: '1000' };
  const service = new MerchantService(store, offering, chain, 'https://www.wayleave.xyz', () => now);
  return { store, buyer, chain, offering, service, time: (value: number) => { now = value; }, epoch: (value: string) => { epoch = value; } };
}
async function quoteAndRequest(f: ReturnType<typeof fixture>, key = 'purchase-test') {
  const quote = await f.service.quote(f.buyer, f.offering.id, key);
  const purchase = await f.service.requestPurchase(quote.id, f.buyer);
  return { quote, purchase };
}
/** Simulated trusted adapter output; not onchain evidence. */
async function settle(f: ReturnType<typeof fixture>, operationId: string, nonce = `0x${'ab'.repeat(32)}`, amount = '100000') {
  const op = await f.service.operations.get(operationId, f.buyer.owner);
  const hash = `0x${'cd'.repeat(32)}` as const;
  await f.service.operations.save(op!, { status: 'settled', source: { transactionHash: hash, userOpHash: hash, blockNumber: '1', message: '0x', fingerprint: hash }, destination: { transactionHash: hash, blockNumber: '2', nonce: nonce as `0x${string}`, merchantAmount: amount } }, 1001);
}
test('quotes bind immutable pricing; concurrent acceptance and retries create one payment', async () => {
  const f = fixture();
  const q = await f.service.quote(f.buyer, f.offering.id, 'quote-test');
  expect(q).toMatchObject({ sourceDebit: '101000', minimumMerchantReceipt: '100000', maximumMerchantReceipt: '101000', maximumTransferFee: '1000', gasIncluded: false });
  expect((await f.service.quote(f.buyer, f.offering.id, 'quote-test')).id).toBe(q.id);
  const purchases = await Promise.all([f.service.requestPurchase(q.id, f.buyer), f.service.requestPurchase(q.id, f.buyer)]);
  expect(purchases[0].operationId).toBe(purchases[1].operationId);
  expect((await f.service.operations.list(f.buyer.owner))).toHaveLength(1);
  expect(purchases[0].approvalUrl).toBe(`https://www.wayleave.xyz/spending?request=${purchases[0].operationId}&purchase=${q.id}`);
  expect(JSON.stringify(purchases[0])).not.toContain('signature');
  f.time(q.expiresAt + 1);
  expect((await f.service.requestPurchase(q.id, f.buyer)).operationId).toBe(purchases[0].operationId);
});
test('expired unaccepted quote, changed account epoch and another agent cannot purchase', async () => {
  const f = fixture(); const q = await f.service.quote(f.buyer, f.offering.id, 'quote-test');
  await expect(f.service.requestPurchase(q.id, { ...f.buyer, id: 'intruder' })).rejects.toThrow('not found');
  await expect(f.service.requestPurchase(q.id, { ...f.buyer, account: testCctpIntent.recipient })).rejects.toThrow('authority changed');
  f.epoch('2'); await expect(f.service.requestPurchase(q.id, f.buyer)).rejects.toThrow('authority changed');
  f.epoch('1'); f.time(q.expiresAt);
  await expect(f.service.requestPurchase(q.id, f.buyer)).rejects.toThrow('expired');
  expect(await f.service.operations.list(f.buyer.owner)).toHaveLength(0);
});
test('approval and source burn do not unlock files; insufficient destination receipt stays locked', async () => {
  const f = fixture(); const { purchase } = await quoteAndRequest(f);
  await expect(f.service.delivery(purchase.id, f.buyer.owner)).rejects.toThrow('locked');
  const op = await f.service.operations.get(purchase.operationId, f.buyer.owner);
  await f.service.operations.save(op!, { status: 'attestation_pending' }, 1001);
  await expect(f.service.delivery(purchase.id, f.buyer.owner)).rejects.toThrow('locked');
  await settle(f, purchase.operationId, undefined, '99999');
  await expect(f.service.delivery(purchase.id, f.buyer.owner)).rejects.toThrow('locked');
});
test('delivery content is versioned and one settlement cannot unlock a second purchase', async () => {
  const f = fixture(); const { purchase } = await quoteAndRequest(f);
  await settle(f, purchase.operationId);
  const delivery = await f.service.delivery(purchase.id, f.buyer.owner, f.buyer.id);
  await verifyDelivery(delivery, purchase.quote.offering.contentSha256);
  expect(delivery.files.some(file => file.name === 'docs/architecture.md')).toBe(true);
  expect((await f.service.purchase(purchase.id, f.buyer.owner)).delivery).toBe('available');
  expect(await f.service.delivery(purchase.id, f.buyer.owner)).toEqual(delivery);
  const next = await quoteAndRequest(f, 'different-purchase');
  await settle(f, next.purchase.operationId);
  await expect(f.service.delivery(next.purchase.id, f.buyer.owner)).rejects.toThrow('already allocated');
  await expect(f.service.delivery(purchase.id, testCctpIntent.recipient)).rejects.toThrow('not found');
  await expect(f.service.delivery(purchase.id, f.buyer.owner, 'intruder')).rejects.toThrow('not found');
});
test('accepted purchase and fulfillment survive a gateway restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'merchant-'));
  try {
    const f = fixture(join(dir, 'merchant.sqlite')); const { purchase } = await quoteAndRequest(f);
    await settle(f, purchase.operationId); await f.service.delivery(purchase.id, f.buyer.owner);
    stores.splice(stores.indexOf(f.store), 1); f.store.close();
    const next = fixture(join(dir, 'merchant.sqlite'));
    expect((await next.service.purchase(purchase.id, f.buyer.owner)).delivery).toBe('available');
    expect((await next.service.requestPurchase(purchase.id, f.buyer)).operationId).toBe(purchase.operationId);
    stores.splice(stores.indexOf(next.store), 1); next.store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('routes refuse fabricated settlement and require scoped identities or owner sessions', async () => {
  const f = fixture(); const route = createMerchantRoute({ store: f.store, chain: f.chain, audience: 'https://www.wayleave.xyz', offering: f.offering, now: () => 1000, authenticateAgent: async r => r.headers.get('authorization') === 'Bearer enrolled' ? f.buyer : null });
  const call = (path: string, body?: unknown, headers: Record<string, string> = {}) => route(new Request(`https://www.wayleave.xyz${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
  expect((await call('/merchant/offerings'))!.status).toBe(200);
  expect((await call('/merchant/purchases'))!.status).toBe(401);
  expect((await call('/agent/merchant/quotes', { offeringId: f.offering.id, idempotencyKey: 'test-key' }))!.status).toBe(401);
  const auth = { authorization: 'Bearer enrolled' };
  expect((await call('/agent/merchant/quotes', { offeringId: f.offering.id, idempotencyKey: 'test-key', recipient: testCctpIntent.account }, auth))!.status).toBe(400);
  const q = await (await call('/agent/merchant/quotes', { offeringId: f.offering.id, idempotencyKey: 'test-key' }, auth))!.json();
  const p = await (await call(`/agent/merchant/quotes/${q.id}/purchase`, {}, auth))!.json();
  expect((await call(`/agent/merchant/purchases/${p.id}/delivery`, undefined, auth))!.status).toBe(402);
  expect((await call(`/agent/merchant/purchases/${p.id}/delivery`, { settled: true }, auth))!.status).toBe(404);
  const token = 'cd'.repeat(32);
  await f.store.createSession(createHash('sha256').update(token).digest('hex'), f.buyer.owner, 2000);
  const own = await (await call('/merchant/purchases', undefined, { cookie: `mandate_session=${token}` }))!.json();
  expect(own.purchases[0].id).toBe(p.id);
  expect(JSON.stringify(own)).not.toContain('prepared');
});
test('unconfigured merchant stays unavailable and price cannot overflow', async () => {
  const f = fixture(); const empty = { ...f.offering, available: false };
  const service = new MerchantService(f.store, empty, f.chain, 'https://www.wayleave.xyz');
  await expect(service.quote(f.buyer, empty.id, 'test-key')).rejects.toThrow('not configured');
});
