import { encodeAbiParameters, encodeFunctionData, erc20Abi, getAddress, isAddress, keccak256, padHex, parseAbi, stringToHex, zeroAddress, zeroHash, type Address, type Hex } from 'viem';
import { kernelAbi } from './generated/Kernel';

/** Circle CCTP V2 testnet deployments, verified against Circle docs 2026-09-11.
 * https://developers.circle.com/cctp/references/contract-addresses
 * https://developers.circle.com/stablecoins/usdc-contract-addresses
 * Native Arc USDC (18 decimals) and ERC20 USDC (6 decimals) share a balance.
 */
export const arcCctpRoute = Object.freeze({
  sourceChainId: 5042002, sourceDomain: 26, destinationChainId: 11155111, destinationDomain: 0,
  sourceToken: '0x3600000000000000000000000000000000000000' as Address,
  destinationToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
  tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as Address,
  messageTransmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as Address,
  tokenDecimals: 6, nativeDecimals: 18,
});
export const cctpAbi = parseAbi([
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)',
  'function receiveMessage(bytes message, bytes attestation) returns (bool)',
  'function localDomain() view returns (uint32)',
  'function usedNonces(bytes32 nonce) view returns (uint256)',
  'event MessageSent(bytes message)',
]);
export type CctpIntent = {
  version: 1; kind: 'cctp_payment'; sourceChainId: 5042002; destinationChainId: 11155111;
  sourceDomain: 26; destinationDomain: 0; sourceToken: Address; destinationToken: Address;
  account: Address; fundingOwner: Address; recipient: Address;
  /** Integer 6-decimal units. Merchant receives amount minus actual Circle fee. */
  amount: string; maxFee: string; amountSemantics: 'source_debit';
  minFinalityThreshold: 2000; businessReference: string; idempotencyKey: string;
};
function address(value: unknown): Address {
  if (typeof value !== 'string' || !isAddress(value, { strict: false }) || value.toLowerCase() === zeroAddress) throw new Error('Invalid nonzero address');
  return getAddress(value);
}
function units(value: unknown, positive = false): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) >= 1n << 256n || (positive && BigInt(value) === 0n)) throw new Error('Invalid USDC base units');
  return value;
}
function textField(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) throw new Error('Reference and idempotency key require 1–128 characters');
  return value;
}
/** Reject unsupported fields rather than silently approving a different route. */
export function parseCctpIntent(value: unknown): CctpIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid CCTP intent');
  const v = value as Record<string, unknown>;
  const constants = { version: 1, kind: 'cctp_payment', sourceChainId: 5042002, destinationChainId: 11155111, sourceDomain: 26, destinationDomain: 0, amountSemantics: 'source_debit', minFinalityThreshold: 2000 } as const;
  for (const [key, expected] of Object.entries(constants)) if (v[key] !== expected) throw new Error(`Unsupported CCTP ${key}`);
  const sourceToken = address(v.sourceToken), destinationToken = address(v.destinationToken);
  if (sourceToken !== getAddress(arcCctpRoute.sourceToken) || destinationToken !== getAddress(arcCctpRoute.destinationToken)) throw new Error('Unsupported CCTP token');
  const amount = units(v.amount, true), maxFee = units(v.maxFee);
  if (BigInt(maxFee) >= BigInt(amount)) throw new Error('Maximum fee must be less than source debit');
  const result: CctpIntent = { ...constants, sourceToken, destinationToken, account: address(v.account), fundingOwner: address(v.fundingOwner), recipient: address(v.recipient), amount, maxFee, businessReference: textField(v.businessReference), idempotencyKey: textField(v.idempotencyKey) };
  if (Object.keys(v).some(key => !Object.hasOwn(result, key))) throw new Error('Unknown CCTP intent field');
  return result;
}
export function cctpIntentHash(value: CctpIntent): Hex { return keccak256(stringToHex(JSON.stringify(parseCctpIntent(value)))); }
export function cctpPaymentSummary(value: CctpIntent) {
  const i = parseCctpIntent(value);
  return { sourceDebit: i.amount, maximumCircleFee: i.maxFee, minimumMerchantReceipt: (BigInt(i.amount) - BigInt(i.maxFee)).toString(), gasExcluded: true, decimals: 6 };
}
/** Atomic default-mode batch: exact owner pull, clear allowance, exact approval, burn, clear allowance.
 * No destination hook, forwarding, arbitrary target or agent signature is accepted.
 * Business reference is a gateway correlation field; the signed UserOp binds economic terms.
 */
export function cctpOwnerPayment(value: CctpIntent): Hex {
  const i = parseCctpIntent(value), r = arcCctpRoute;
  const calls = [
    { target: r.sourceToken, value: 0n, callData: encodeFunctionData({ abi: erc20Abi, functionName: 'transferFrom', args: [i.fundingOwner, i.account, BigInt(i.amount)] }) },
    { target: r.sourceToken, value: 0n, callData: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [r.tokenMessenger, 0n] }) },
    { target: r.sourceToken, value: 0n, callData: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [r.tokenMessenger, BigInt(i.amount)] }) },
    { target: r.tokenMessenger, value: 0n, callData: encodeFunctionData({ abi: cctpAbi, functionName: 'depositForBurn', args: [BigInt(i.amount), r.destinationDomain, padHex(i.recipient, { size: 32 }), r.sourceToken, zeroHash, BigInt(i.maxFee), i.minFinalityThreshold] }) },
    { target: r.sourceToken, value: 0n, callData: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [r.tokenMessenger, 0n] }) },
  ];
  return encodeFunctionData({ abi: kernelAbi, functionName: 'execute', args: [`0x01${'00'.repeat(31)}`, encodeAbiParameters([{ type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'callData', type: 'bytes' }] }], [calls])] });
}

/** Parse the fixed, hook-free V2 wire format, never the API's advisory decoded fields. */
export function parseCctpMessage(message: Hex, value: CctpIntent, attested = false) {
  const i = parseCctpIntent(value);
  if (!/^0x[0-9a-fA-F]{752}$/.test(message)) throw new Error('Expected hook-free CCTP V2 message');
  const part = (offset: number, bytes: number): Hex => `0x${message.slice(2 + offset * 2, 2 + (offset + bytes) * 2)}`;
  const number = (offset: number, bytes = 32) => BigInt(part(offset, bytes));
  const sameAddress = (offset: number, expected: Address) => part(offset, 32).toLowerCase() === padHex(expected, { size: 32 }).toLowerCase();
  if (number(0, 4) !== 1n || number(148, 4) !== 1n || number(4, 4) !== 26n || number(8, 4) !== 0n ||
    !sameAddress(44, arcCctpRoute.tokenMessenger) || !sameAddress(76, arcCctpRoute.tokenMessenger) || part(108, 32) !== zeroHash ||
    number(140, 4) !== 2000n || !sameAddress(152, i.sourceToken) || !sameAddress(184, i.recipient) || number(216) !== BigInt(i.amount) ||
    !sameAddress(248, i.account) || number(280) !== BigInt(i.maxFee)) throw new Error('CCTP message does not match approved payment');
  if (number(312) > BigInt(i.maxFee)) throw new Error('Circle fee exceeds approval');
  if (attested && (number(144, 4) < 2000n || part(12, 32) === zeroHash)) throw new Error('CCTP message is not finalized');
  // Iris fills only nonce, executed finality, executed fee and expiry after source emission.
  const canonical = `${message.slice(0, 26)}${'0'.repeat(64)}${message.slice(90, 290)}${'0'.repeat(8)}${message.slice(298, 626)}${'0'.repeat(128)}` as Hex;
  return { nonce: part(12, 32), messageBody: part(148, 228), fingerprint: keccak256(canonical), fee: number(312).toString(), merchantAmount: (BigInt(i.amount) - number(312)).toString(), expirationBlock: number(344).toString() };
}
export function cctpMintCall(message: Hex, attestation: Hex, intent: CctpIntent) {
  parseCctpMessage(message, intent, true);
  if (!/^0x(?:[0-9a-fA-F]{130})+$/.test(attestation)) throw new Error('Malformed Circle attestation');
  return { chainId: arcCctpRoute.destinationChainId, to: arcCctpRoute.messageTransmitter, data: encodeFunctionData({ abi: cctpAbi, functionName: 'receiveMessage', args: [message, attestation] }), value: '0' };
}
