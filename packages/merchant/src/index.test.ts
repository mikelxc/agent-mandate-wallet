import { expect, test } from 'bun:test';
import { createMerchantClient, quoteAmounts, verifyDelivery } from './index';
import { createHash } from 'node:crypto';
test('amount arithmetic is exact and rejects malformed/overflow pricing', () => {
  expect(quoteAmounts('100000', '1000').sourceDebit).toBe('101000');
  for (const value of ['0', '-1', '1.5', '01', (1n << 256n).toString()]) expect(() => quoteAmounts(value, '0')).toThrow();
  expect(() => quoteAmounts(((1n << 256n) - 1n).toString(), '1')).toThrow();
});
test('merchant client preserves saved quote and purchase identifiers without payment terms', async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const client = createMerchantClient(async <T>(path: string, init?: RequestInit) => { calls.push({ path, init }); return {} as T; });
  await client.listOfferings(); await client.getPurchaseQuote({ offeringId: 'pack', idempotencyKey: 'attempt-1' }); await client.requestPurchase('saved-quote'); await client.getPurchase('purchase'); await client.getPurchaseDelivery('purchase');
  expect(calls.map(c => c.path)).toEqual(['/merchant/offerings', '/agent/merchant/quotes', '/agent/merchant/quotes/saved-quote/purchase', '/agent/merchant/purchases/purchase', '/agent/merchant/purchases/purchase/delivery']);
  expect(calls[2].init?.body).toBe('{}');
});
test('download digest detects tampered content and unsafe file paths', async () => {
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const files = [{ name: 'guide.md', mediaType: 'text/plain', content: 'guide', sha256: hash('guide') }];
  const sha256 = hash(JSON.stringify(files)); const delivery = { purchaseId: 'p', offeringId: 'pack', version: '1', files, sha256 };
  await verifyDelivery(delivery, sha256);
  await expect(verifyDelivery({ ...delivery, files: [{ ...files[0], content: 'changed' }] }, sha256)).rejects.toThrow();
  const unsafe = [{ ...files[0], name: '../guide.md' }], unsafeHash = hash(JSON.stringify(unsafe));
  await expect(verifyDelivery({ ...delivery, files: unsafe, sha256: unsafeHash }, unsafeHash)).rejects.toThrow('Invalid purchased file');
});
