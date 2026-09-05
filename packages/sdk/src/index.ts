import { parseUnits } from 'viem';
export * from './kernel';
export * from './sepolia';
export { kernelAccountFactoryAbi } from './generated/KernelAccountFactory';
export { nFTOwnerValidatorAbi } from './generated/NFTOwnerValidator';
export { kernelAbi } from './generated/Kernel';
export { entryPointAbi } from './generated/EntryPoint';
export { accountFactoryAbi } from './generated/AccountFactory';
export { operatingAccountAbi } from './generated/OperatingAccount';
export { mockUSDCAbi } from './generated/MockUSDC';
export type Policy = { recipient: string; perPayment: string; budget: string; spent: string; revoked: boolean };
export type PaymentRequest = { id: string; recipient: string; amount: string };
export function evaluatePayment(policy: Policy, request: PaymentRequest, completed: ReadonlySet<string>): string | null {
  if (policy.revoked) return 'Agent access revoked';
  if (completed.has(request.id)) return 'Request already paid';
  if (request.recipient.toLowerCase() !== policy.recipient.toLowerCase()) return 'Recipient is outside the mandate';
  try {
    const amount = usdc(request.amount);
    if (amount <= 0n) return 'Amount must be positive';
    if (amount > usdc(policy.perPayment)) return 'Per-payment limit exceeded';
    if (amount + usdc(policy.spent) > usdc(policy.budget)) return 'Remaining budget exceeded';
  } catch { return 'Enter a valid USDC amount'; }
  return null;
}
export function usdc(value: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error('USDC accepts up to six decimal places');
  return parseUnits(value, 6);
}
export function validLabel(value: string): boolean { return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(value); }
