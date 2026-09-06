import { describe, expect, test } from "bun:test";
import { canonicalIntentHash, parsePaymentIntent, ProtocolError } from "./index";

const NOW = 1_700_000_000;
const base = {
  chainId: 11155111,
  account: "0x1111111111111111111111111111111111111111",
  fundingOwner: "0x2222222222222222222222222222222222222222",
  token: "0x3333333333333333333333333333333333333333",
  recipient: "0x4444444444444444444444444444444444444444",
  amount: "1000000",
  businessReference: "Invoice 42",
  idempotencyKey: "invoice-42",
  expiresAt: NOW + 3600,
};

describe("payment intent protocol", () => {
  test("validates, normalizes addresses, and hashes canonical fields", () => {
    const intent = parsePaymentIntent(
      { ...base, account: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" },
      NOW,
    );
    expect(intent.account).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(canonicalIntentHash(intent)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(canonicalIntentHash(intent)).toBe(
      canonicalIntentHash({ ...intent, idempotencyKey: "different-key" }),
    );
  });

  test("rejects unknown keys, invalid amounts, recipient owner, and expiry", () => {
    for (const input of [
      { ...base, extra: true },
      { ...base, amount: "01" },
      { ...base, recipient: base.fundingOwner },
      { ...base, expiresAt: NOW },
      { ...base, expiresAt: NOW + 86401 },
    ])
      expect(() => parsePaymentIntent(input, NOW)).toThrow(ProtocolError);
  });

  test("different canonical payloads produce different hashes", () => {
    const first = parsePaymentIntent(base, NOW);
    const second = parsePaymentIntent({ ...base, amount: "1000001" }, NOW);
    expect(canonicalIntentHash(first)).not.toBe(canonicalIntentHash(second));
  });
});
