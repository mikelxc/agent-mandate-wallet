import {
  encodeFunctionData,
  formatEther,
  formatUnits,
  type Address,
  type Hex,
} from 'viem';
import {
  sepoliaDeployment as d,
  mockUSDCAbi,
  entryPointAbi,
} from '@mandate/sdk';

export type FundingStep = {
  kind: 'tokens' | 'allowance' | 'gas';
  label: string;
  detail: string;
  to: Address;
  data: Hex;
  value: bigint;
  minimumValue?: bigint;
};
export function paymentSetupSteps(
  owner: Address,
  account: Address,
  amount: bigint,
  balances: { token: bigint; allowance: bigint; deposit: bigint },
  maxFee: bigint,
): FundingStep[] {
  if (amount <= 0n || maxFee <= 0n || maxFee > 50_000_000_000n)
    throw new Error(
      'Payment amount or current gas quote is outside the safety limit. Review again later.',
    );
  const steps: FundingStep[] = [];
  if (balances.token < amount) {
    const missing = amount - balances.token;
    steps.push({
      kind: 'tokens',
      label: 'Get demo tokens',
      detail: `Mint ${formatUnits(missing, 6)} demo USDC to your wallet. These are test tokens.`,
      to: d.token,
      data: encodeFunctionData({
        abi: mockUSDCAbi,
        functionName: 'mint',
        args: [owner, missing],
      }),
      value: 0n,
    });
  }
  if (balances.allowance < amount)
    steps.push({
      kind: 'allowance',
      label: 'Approve payment amount',
      detail: `Allow this account to spend up to ${formatUnits(amount, 6)} demo USDC from your wallet. This replaces its existing allowance; it is not unlimited.`,
      to: d.token,
      data: encodeFunctionData({
        abi: mockUSDCAbi,
        functionName: 'approve',
        args: [account, amount],
      }),
      value: 0n,
    });
  const required = maxFee * 660_000n;
  const minimumValue = required - balances.deposit;
  const shortfall = (required * 120n + 99n) / 100n - balances.deposit;
  if (minimumValue > 0n)
    steps.push({
      kind: 'gas',
      label: 'Add payment gas',
      detail: `Deposit ${formatEther(shortfall)} Sepolia ETH for this account's payment gas. Includes a 20% reserve for fee changes. Unused gas stays in the account deposit.`,
      to: d.entryPoint,
      data: encodeFunctionData({
        abi: entryPointAbi,
        functionName: 'depositTo',
        args: [account],
      }),
      value: shortfall,
      minimumValue,
    });
  return steps;
}

export function reuseReviewedGasQuote(
  next: FundingStep,
  shown: FundingStep | undefined,
): FundingStep {
  if (
    next.kind === 'gas' &&
    shown?.kind === 'gas' &&
    next.to === shown.to &&
    next.data === shown.data &&
    next.minimumValue !== undefined &&
    next.minimumValue <= shown.value
  )
    return shown;
  return next;
}
