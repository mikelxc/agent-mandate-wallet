import { expect, test } from 'bun:test';
import { decodeFunctionData } from 'viem';
import {
  mockUSDCAbi,
  entryPointAbi,
  sepoliaDeployment as d,
} from '@mandate/sdk';
import { paymentSetupSteps, reuseReviewedGasQuote } from './payment-setup';
const owner = '0x1111111111111111111111111111111111111111';
const account = '0x2222222222222222222222222222222222222222';
const fee = 2_000_000_000n;
const deposit = fee * 660_000n;

test('production case asks for exact token allowance and disclosed gas reserve', () => {
  const steps = paymentSetupSteps(
    owner,
    account,
    1n,
    { token: 100_000_000n, allowance: 0n, deposit: 0n },
    fee,
  );
  expect(steps.map((s) => s.kind)).toEqual(['allowance', 'gas']);
  expect(steps[0].to).toBe(d.token);
  expect(decodeFunctionData({ abi: mockUSDCAbi, data: steps[0].data })).toEqual(
    { functionName: 'approve', args: [account, 1n] },
  );
  expect(steps[1].to).toBe(d.entryPoint);
  expect(
    decodeFunctionData({ abi: entryPointAbi, data: steps[1].data }),
  ).toEqual({ functionName: 'depositTo', args: [account] });
  expect(steps[1].value).toBe((deposit * 120n) / 100n);
  expect(steps[1].minimumValue).toBe(deposit);
});
test('mints only missing demo tokens to the owner and never transfers payment during setup', () => {
  const steps = paymentSetupSteps(
    owner,
    account,
    5n,
    { token: 2n, allowance: 0n, deposit: 0n },
    fee,
  );
  expect(steps.map((s) => s.kind)).toEqual(['tokens', 'allowance', 'gas']);
  expect(decodeFunctionData({ abi: mockUSDCAbi, data: steps[0].data })).toEqual(
    { functionName: 'mint', args: [owner, 3n] },
  );
  expect(steps.slice(0, 2).every((s) => s.value === 0n)).toBe(true);
});
test('retry skips confirmed steps and preserves sufficient existing allowance', () => {
  expect(
    paymentSetupSteps(
      owner,
      account,
      5n,
      { token: 5n, allowance: 20n, deposit: deposit - 10n },
      fee,
    ).map((s) => [s.kind, s.value]),
  ).toEqual([['gas', deposit / 5n + 10n]]);
  expect(
    paymentSetupSteps(
      owner,
      account,
      5n,
      { token: 5n, allowance: 5n, deposit },
      fee,
    ),
  ).toEqual([]);
});
test('refuses zero amount and fees above the gateway safety ceiling', () => {
  const balances = { token: 0n, allowance: 0n, deposit: 0n };
  expect(() => paymentSetupSteps(owner, account, 0n, balances, fee)).toThrow();
  expect(() =>
    paymentSetupSteps(owner, account, 1n, balances, 50_000_000_001n),
  ).toThrow();
});

test('keeps the reviewed top-up when the new minimum fits its reserve', () => {
  const shown = paymentSetupSteps(
    owner,
    account,
    1n,
    { token: 1n, allowance: 1n, deposit: 0n },
    fee,
  )[0];
  const next = paymentSetupSteps(
    owner,
    account,
    1n,
    { token: 1n, allowance: 1n, deposit: 0n },
    (fee * 110n) / 100n,
  )[0];
  expect(reuseReviewedGasQuote(next, shown)).toBe(shown);
  const higher = paymentSetupSteps(
    owner,
    account,
    1n,
    { token: 1n, allowance: 1n, deposit: 0n },
    (fee * 130n) / 100n,
  )[0];
  expect(reuseReviewedGasQuote(higher, shown)).toBe(higher);
  const other = { ...next, to: owner } as const;
  expect(reuseReviewedGasQuote(other, shown)).toBe(other);
  expect(
    paymentSetupSteps(
      owner,
      account,
      1n,
      { token: 1n, allowance: 1n, deposit: shown.value },
      (fee * 110n) / 100n,
    ),
  ).toEqual([]);
});
