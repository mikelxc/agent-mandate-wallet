import { isAddress, keccak256, stringToHex } from "viem";

export const PAYMENT_CHAIN_ID = 11155111 as const;
const DAY_IN_SECONDS = 24 * 60 * 60;
const UINT256_MAX = (1n << 256n) - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type PaymentIntent = {
  chainId: typeof PAYMENT_CHAIN_ID;
  account: string;
  fundingOwner: string;
  token: string;
  recipient: string;
  amount: string;
  businessReference: string;
  idempotencyKey: string;
  expiresAt: number;
};

export type Operation = {
  id: string;
  agentId: string;
  owner: string;
  intent: PaymentIntent;
  intentHash: string;
  status: "approval_required" | "rejected" | "approved";
  createdAt: number;
  updatedAt: number;
  decisionReason?: string;
};

export type AgentConnection = {
  id: string;
  name: string;
  owner: string;
  account: string;
  expiresAt: number;
  revokedAt: number | null;
  createdAt: number;
};

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtocolError";
  }
}

const INTENT_KEYS = [
  "chainId",
  "account",
  "fundingOwner",
  "token",
  "recipient",
  "amount",
  "businessReference",
  "idempotencyKey",
  "expiresAt",
] as const;

function fail(message: string): never {
  throw new ProtocolError(message);
}

function address(value: unknown, field: string, nonzero = false): string {
  if (typeof value !== "string" || !isAddress(value)) fail(`${field} must be a valid address`);
  const normalized = value.toLowerCase();
  if (nonzero && normalized === ZERO_ADDRESS) fail(`${field} must not be the zero address`);
  return normalized;
}

function exactString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    fail(`${field} must be between ${min} and ${max} characters`);
  }
  return value;
}

function canonicalAmount(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    fail("amount must be a positive canonical base-unit integer string");
  }
  try {
    const amount = BigInt(value);
    if (amount > UINT256_MAX) fail("amount exceeds uint256");
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
    fail("amount must be a positive canonical base-unit integer string");
  }
  return value;
}

/** Parse and normalize an untrusted payment intent. `now` is Unix seconds and is injectable for deterministic tests. */
export function parsePaymentIntent(
  input: unknown,
  now = Math.floor(Date.now() / 1000),
): PaymentIntent {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    fail("payment intent must be an object");
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...INTENT_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail("payment intent contains unknown or missing fields");
  }
  if (record.chainId !== PAYMENT_CHAIN_ID) fail("chainId must be Sepolia (11155111)");
  if (!Number.isSafeInteger(now)) fail("now must be an integer Unix timestamp");
  if (typeof record.expiresAt !== "number" || !Number.isSafeInteger(record.expiresAt))
    fail("expiresAt must be an integer Unix timestamp");
  if (record.expiresAt <= now || record.expiresAt > now + DAY_IN_SECONDS)
    fail("expiresAt must be in the next 24 hours");
  const fundingOwner = address(record.fundingOwner, "fundingOwner");
  const recipient = address(record.recipient, "recipient", true);
  if (recipient === fundingOwner) fail("recipient must differ from fundingOwner");
  return {
    chainId: PAYMENT_CHAIN_ID,
    account: address(record.account, "account"),
    fundingOwner,
    token: address(record.token, "token"),
    recipient,
    amount: canonicalAmount(record.amount),
    businessReference: exactString(record.businessReference, "businessReference", 1, 120),
    idempotencyKey: exactString(record.idempotencyKey, "idempotencyKey", 8, 120),
    expiresAt: record.expiresAt,
  };
}

/** Hash the canonical intent fields. Idempotency is transport metadata and is intentionally excluded. */
export function canonicalIntentHash(intent: PaymentIntent): `0x${string}` {
  const canonical = JSON.stringify({
    chainId: intent.chainId,
    account: intent.account.toLowerCase(),
    fundingOwner: intent.fundingOwner.toLowerCase(),
    token: intent.token.toLowerCase(),
    recipient: intent.recipient.toLowerCase(),
    amount: intent.amount,
    businessReference: intent.businessReference,
    expiresAt: intent.expiresAt,
  });
  return keccak256(stringToHex(canonical));
}
