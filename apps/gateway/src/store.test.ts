import { describe, expect, test } from "bun:test";
import { Store } from "./store";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const make = () => {
  const dir = mkdtempSync(join(tmpdir(), "mandate-store-"));
  return { dir, path: join(dir, "store.sqlite") };
};
const withStore = (fn: (s: Store) => void) => {
  const x = make();
  const s = new Store(x.path);
  try {
    fn(s);
  } finally {
    s.close();
    rmSync(x.dir, { recursive: true, force: true });
  }
};
const agent = (s: Store, owner = "owner") =>
  s.createAgent(
    { name: "demo", owner, account: "acct", tokenHash: `token-${owner}`, expiresAt: 1000 },
    1,
  );

describe("Store", () => {
  test("persists and atomically consumes a challenge once", () => {
    const x = make();
    const a = new Store(x.path);
    a.createChallenge({ id: "c", message: "m", address: "0x1", expiresAt: 100 });
    expect(a.consumeChallenge("c", 1)?.usedAt).toBe(1);
    a.close();
    const b = new Store(x.path);
    expect(b.getChallenge("c")?.usedAt).toBe(1);
    expect(b.consumeChallenge("c", 2)).toBeNull();
    b.close();
    rmSync(x.dir, { recursive: true, force: true });
  });
  test("rejects expired challenges and supports session deletion", () =>
    withStore((s) => {
      s.createChallenge({ id: "e", message: "m", address: "a", expiresAt: 1 });
      expect(s.consumeChallenge("e", 1)).toBeNull();
      s.createSession("h", "a", 10);
      expect(s.session("h", 2)).toBe("a");
      expect(s.deleteSession("h")).toBe(true);
      expect(s.session("h", 2)).toBeNull();
    }));
  test("enforces idempotency and owner isolation", () =>
    withStore((s) => {
      const a = agent(s);
      const op = s.propose(a, { idempotencyKey: "k", x: 1 }, "h", 2);
      expect(s.propose(a, { x: 2 }, "h", "k", 3).id).toBe(op.id);
      expect(() => s.propose(a, {}, "other", "k", 3)).toThrow("idempotency key conflict");
      expect(s.listOperations("other")).toHaveLength(0);
      expect(s.operationForOwner(op.id, "other")).toBeNull();
    }));
  test("revokes agents and omits token hashes", () =>
    withStore((s) => {
      const a = agent(s);
      expect(a).not.toHaveProperty("tokenHash");
      expect(s.authenticateAgent("token-owner", 2)?.id).toBe(a.id);
      expect(s.revokeAgent(a.id, "other", 3)).toBe(false);
      expect(s.revokeAgent(a.id, "owner", 3)).toBe(true);
      expect(s.authenticateAgent("token-owner", 4)).toBeNull();
    }));
  test("requires prepared operation and records approval without exposing signature", () =>
    withStore((s) => {
      const a = agent(s);
      const op = s.propose(a, { idempotencyKey: "k", expiresAt: 100 }, "h", 2);
      expect(() => s.recordApproval(op.id, "owner", "sig", 3)).toThrow("operation not prepared");
      s.setPrepared(op.id, "owner", { userOp: "payload" }, 3);
      const approved = s.recordApproval(op.id, "owner", "sig", 4);
      expect(approved.status).toBe("approved");
      expect(approved).not.toHaveProperty("signature");
      expect(approved.execution).toBeUndefined();
      expect(s.recordApproval(op.id, "owner", "sig", 5).status).toBe("approved");
      expect(() => s.recordApproval(op.id, "owner", "other", 5)).toThrow("decision conflict");
    }));
  test("expires approval and persists rejection", () =>
    withStore((s) => {
      const a = agent(s);
      const op = s.propose(a, { idempotencyKey: "k", expiresAt: 5 }, "h", 2);
      s.setPrepared(op.id, "owner", {}, 3);
      expect(() => s.recordApproval(op.id, "owner", "sig", 5)).toThrow("intent expired");
      expect(s.operationForOwner(op.id, "owner")?.status).toBe("rejected");
    }));
  test("stores execution receipts only for approved operations", () =>
    withStore((s) => {
      const a = agent(s);
      const op = s.propose(a, { idempotencyKey: "k" }, "h", 2);
      expect(() =>
        s.recordExecution(
          op.id,
          "owner",
          { transactionHash: "tx", userOpHash: "uo", success: true, blockNumber: "9" },
          3,
        ),
      ).toThrow("operation not approved");
      s.decide(op.id, "owner", "approved", null, 3);
      const done = s.recordExecution(
        op.id,
        "owner",
        { transactionHash: "tx", userOpHash: "uo", success: true, blockNumber: "9" },
        4,
      );
      expect(done.execution).toEqual({
        transactionHash: "tx",
        userOpHash: "uo",
        success: true,
        blockNumber: "9",
      });
    }));
  test("blocks a second prepared payment for the same account", () =>
    withStore((s) => {
      const a = agent(s);
      const one = s.propose(
        a,
        { idempotencyKey: "invoice-01", account: a.account, expiresAt: 100 },
        "h1",
        2,
      );
      const two = s.propose(
        a,
        { idempotencyKey: "invoice-02", account: a.account, expiresAt: 100 },
        "h2",
        2,
      );
      s.setPrepared(one.id, "owner", { actionHash: "0x1", preparedUntil: 50 }, 2);
      expect(() =>
        s.setPrepared(two.id, "owner", { actionHash: "0x2", preparedUntil: 50 }, 2),
      ).toThrow("another prepared");
    }));
  test("rejects replacing a fresh prepared quote with a different action hash", () =>
    withStore((s) => {
      const a = agent(s);
      const op = s.propose(
        a,
        { idempotencyKey: "invoice-01", account: a.account, expiresAt: 100 },
        "h",
        2,
      );
      s.setPrepared(op.id, "owner", { actionHash: "0x1", preparedUntil: 50 }, 2);
      expect(() =>
        s.setPrepared(op.id, "owner", { actionHash: "0x2", preparedUntil: 50 }, 3),
      ).toThrow("Prepared payment conflict");
    }));
  test("rejects conflicting execution receipts", () =>
    withStore((s) => {
      const a = agent(s);
      const op = s.propose(a, { idempotencyKey: "invoice-01", expiresAt: 100 }, "h", 2);
      s.decide(op.id, "owner", "approved", null, 3);
      const receipt = {
        transactionHash: "tx-1",
        userOpHash: "uo",
        success: true,
        blockNumber: "9",
      };
      s.recordExecution(op.id, "owner", receipt, 4);
      expect(() =>
        s.recordExecution(op.id, "owner", { ...receipt, transactionHash: "tx-2" }, 5),
      ).toThrow("Execution receipt conflict");
    }));
});
