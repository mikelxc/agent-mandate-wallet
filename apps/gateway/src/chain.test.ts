import { expect, test } from "bun:test";
import { checkPaymentFunding, PaymentPreparationError } from "./chain";

test("reports both missing allowance and deposit for the production funding case", () => {
  try {
    checkPaymentFunding(1n, { token: "100000000", allowance: "0", deposit: "0" }, 2_000_000_000n);
    throw new Error("Expected funding failure");
  } catch (error) {
    expect(error).toBeInstanceOf(PaymentPreparationError);
    expect((error as PaymentPreparationError).code).toBe("funding_required");
    expect((error as Error).message).toContain("at least 0.000001 demo USDC");
    expect((error as Error).message).toContain("0.00132 Sepolia ETH");
  }
});
test("accepts exact funding boundaries but rejects token shortage and excessive fees", () => {
  const balances = { token: "1", allowance: "1", deposit: "1320000000000000" };
  expect(() => checkPaymentFunding(1n, balances, 2_000_000_000n)).not.toThrow();
  expect(() => checkPaymentFunding(2n, balances, 2_000_000_000n)).toThrow("Your wallet needs");
  expect(() => checkPaymentFunding(1n, balances, 50_000_000_001n)).toThrow("safety limit");
});
