import { expect, test } from 'bun:test';
import type { Purchase } from 'wayleave-merchant';
import {
  formatUsdc,
  purchaseProgress,
  purchaseStatus,
} from './merchant-purchase';
const purchase = {
  paymentStatus: 'approval_required',
  delivery: 'locked',
  quote: { offering: { contentSha256: 'digest' } },
} as Purchase;
test('approval is not settlement or delivery', () => {
  expect(purchaseProgress()).toHaveLength(5);
  expect(purchaseProgress().some((s) => s.complete)).toBe(false);
  expect(
    purchaseProgress({ ...purchase, paymentStatus: 'approved' }).map(
      (s) => s.complete,
    ),
  ).toEqual([true, true, false, false, false]);
  expect(
    purchaseProgress({ ...purchase, paymentStatus: 'settled' })[3].complete,
  ).toBe(false);
});
test('verified receipts and the quoted artifact digest gate completion', () => {
  const settled = {
    ...purchase,
    paymentStatus: 'settled',
    sourceTransactionHash: '0xsource',
    destinationTransactionHash: '0xdest',
  };
  expect(purchaseProgress(settled).map((s) => s.complete)).toEqual([
    true,
    true,
    true,
    true,
    false,
  ]);
  expect(
    purchaseProgress({
      ...settled,
      delivery: 'available',
      bundleSha256: 'wrong',
    })[4].complete,
  ).toBe(false);
  expect(
    purchaseStatus({
      ...settled,
      delivery: 'available',
      bundleSha256: 'digest',
    }),
  ).toBe('Purchase complete');
  expect(
    purchaseStatus({ ...purchase, paymentStatus: 'destination_ready' }),
  ).toContain('Ethereum Sepolia');
});
test('USDC prices preserve cents and fee precision', () => {
  expect(formatUsdc('100000')).toBe('0.10');
  expect(formatUsdc('1000')).toBe('0.001');
  expect(formatUsdc('101000')).toBe('0.101');
  expect(formatUsdc('bad')).toBe('Unavailable');
});
