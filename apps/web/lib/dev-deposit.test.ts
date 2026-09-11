import { expect, test } from 'bun:test';
import { devGasDepositCap, validateDevGasDeposit } from './dev-deposit';

test.each([
  ['zero', 0n],
  ['negative', -1n],
  ['over cap', devGasDepositCap + 1n],
])('rejects %s deposit', (_label, value) => {
  expect(() => validateDevGasDeposit(value)).toThrow();
});

test('accepts a positive deposit at the cap', () => {
  expect(validateDevGasDeposit(devGasDepositCap)).toBe(devGasDepositCap);
});
