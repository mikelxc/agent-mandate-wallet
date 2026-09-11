export const devGasDepositCap = 5_000_000_000_000_000n;

export function validateDevGasDeposit(value: bigint): bigint {
  if (value <= 0n || value > devGasDepositCap)
    throw new Error('Gas deposit is outside the local test-wallet limit.');
  return value;
}
