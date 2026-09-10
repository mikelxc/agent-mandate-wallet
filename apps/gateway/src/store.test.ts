import { describe, expect, test } from "bun:test";
import { Store } from "./store";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const make = () => {
  const dir = mkdtempSync(join(tmpdir(), "mandate-store-"));
  return { dir, path: join(dir, "store.sqlite") };
};
const withStore = async (fn: (s: Store) => void) => {
  const x = make();
  const s = new Store(x.path);
  try {
    await fn(s);
  } finally {
    s.close();
    rmSync(x.dir, { recursive: true, force: true });
  }
};
const agent = async (s: Store, owner = "owner") =>
  await s.createAgent(
    { name: "demo", owner, account: "acct", tokenHash: `token-${owner}`, expiresAt: 1000 },
    1,
  );
describe("Store", () => {
  test("shares sessions, nonce consumption and rate limits across gateway instances", async () => {
    const x = make();
    const a = new Store(x.path);
    const b = new Store(x.path);
    try {
      await Promise.all([a.db.ready, b.db.ready]);
      await a.createSession("shared-session", "owner", 100);
      expect(await b.session("shared-session", 1)).toBe("owner");
      await b.deleteSession("shared-session");
      expect(await a.session("shared-session", 2)).toBeNull();
      await a.createChallenge({
        id: "shared-nonce",
        message: "m",
        address: "owner",
        expiresAt: 100,
      });
      expect(await b.consumeChallenge("shared-nonce", 1)).not.toBeNull();
      expect(await a.consumeChallenge("shared-nonce", 2)).toBeNull();
      expect(await a.takeRateLimit("login", 1, 1)).toBe(true);
      expect(await b.takeRateLimit("login", 2, 1)).toBe(false);
      expect(await b.takeRateLimit("login", 62, 1)).toBe(true);
    } finally {
      a.close();
      b.close();
      rmSync(x.dir, { recursive: true, force: true });
    }
  });
  test("persists and atomically consumes a challenge once", async () => {
    const x = make();
    const a = new Store(x.path);
    await a.createChallenge({ id: "c", message: "m", address: "0x1", expiresAt: 100 });
    expect((await a.consumeChallenge("c", 1))?.usedAt).toBe(1);
    a.close();
    const b = new Store(x.path);
    expect((await b.getChallenge("c"))?.usedAt).toBe(1);
    expect(await b.consumeChallenge("c", 2)).toBeNull();
    b.close();
    rmSync(x.dir, { recursive: true, force: true });
  });
  test("rejects expired challenges and supports session deletion", () =>
    withStore(async (s) => {
      await s.createChallenge({ id: "e", message: "m", address: "a", expiresAt: 1 });
      expect(await s.consumeChallenge("e", 1)).toBeNull();
      await s.createSession("h", "a", 10);
      expect(await s.session("h", 2)).toBe("a");
      expect(await s.deleteSession("h")).toBe(true);
      expect(await s.session("h", 2)).toBeNull();
    }));
  test("enforces idempotency and owner isolation", () =>
    withStore(async (s) => {
      const a = await agent(s);
      const op = await s.propose(a, { idempotencyKey: "k", x: 1 }, "h", 2);
      expect((await s.propose(a, { x: 2 }, "h", "k", 3)).id).toBe(op.id);
      await expect(s.propose(a, {}, "other", "k", 3)).rejects.toThrow("idempotency key conflict");
      expect(await s.listOperations("other")).toHaveLength(0);
      expect(await s.operationForOwner(op.id, "other")).toBeNull();
    }));
  test("revokes agents and omits token hashes", () =>
    withStore(async (s) => {
      const a = await agent(s);
      expect(a).not.toHaveProperty("tokenHash");
      expect((await s.authenticateAgent("token-owner", 2))?.id).toBe(a.id);
      expect(await s.revokeAgent(a.id, "other", 3)).toBe(false);
      expect(await s.revokeAgent(a.id, "owner", 3)).toBe(true);
      expect(await s.authenticateAgent("token-owner", 4)).toBeNull();
    }));
  test("requires prepared operation and records approval without exposing signature", () =>
    withStore(async (s) => {
      const a = await agent(s);
      const op = await s.propose(a, { idempotencyKey: "k", expiresAt: 100 }, "h", 2);
      await expect(s.recordApproval(op.id, "owner", "sig", 3)).rejects.toThrow(
        "operation not prepared",
      );
      await s.setPrepared(op.id, "owner", { userOp: "payload" }, 3);
      const approved = await s.recordApproval(op.id, "owner", "sig", 4);
      expect(approved.status).toBe("approved");
      expect(approved).not.toHaveProperty("signature");
      expect(approved.execution).toBeUndefined();
      expect((await s.recordApproval(op.id, "owner", "sig", 5)).status).toBe("approved");
      await expect(s.recordApproval(op.id, "owner", "other", 5)).rejects.toThrow(
        "decision conflict",
      );
    }));
  test("expires approval and persists rejection", () =>
    withStore(async (s) => {
      const a = await agent(s);
      const op = await s.propose(a, { idempotencyKey: "k", expiresAt: 5 }, "h", 2);
      await s.setPrepared(op.id, "owner", {}, 3);
      await expect(s.recordApproval(op.id, "owner", "sig", 5)).rejects.toThrow("intent expired");
      expect((await s.operationForOwner(op.id, "owner"))?.status).toBe("rejected");
    }));
  test("stores execution receipts only for approved operations", () =>
    withStore(async (s) => {
      const a = await agent(s);
      const op = await s.propose(a, { idempotencyKey: "k" }, "h", 2);
      await expect(
        s.recordExecution(
          op.id,
          "owner",
          { transactionHash: "tx", userOpHash: "uo", success: true, blockNumber: "9" },
          3,
        ),
      ).rejects.toThrow("operation not approved");
      await s.decide(op.id, "owner", "approved", null, 3);
      const done = await s.recordExecution(
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
    withStore(async (s) => {
      const a = await agent(s);
      const one = await s.propose(
        a,
        { idempotencyKey: "invoice-01", account: a.account, expiresAt: 100 },
        "h1",
        2,
      );
      const two = await s.propose(
        a,
        { idempotencyKey: "invoice-02", account: a.account, expiresAt: 100 },
        "h2",
        2,
      );
      await s.setPrepared(one.id, "owner", { actionHash: "0x1", preparedUntil: 50 }, 2);
      await expect(
        s.setPrepared(two.id, "owner", { actionHash: "0x2", preparedUntil: 50 }, 2),
      ).rejects.toThrow("another prepared");
    }));
  test("rejects replacing a fresh prepared quote with a different action hash", () =>
    withStore(async (s) => {
      const a = await agent(s);
      const op = await s.propose(
        a,
        { idempotencyKey: "invoice-01", account: a.account, expiresAt: 100 },
        "h",
        2,
      );
      await s.setPrepared(op.id, "owner", { actionHash: "0x1", preparedUntil: 50 }, 2);
      await expect(
        s.setPrepared(op.id, "owner", { actionHash: "0x2", preparedUntil: 50 }, 3),
      ).rejects.toThrow("Prepared payment conflict");
    }));
  test("rejects conflicting execution receipts", () =>
    withStore(async (s) => {
      const a = await agent(s);
      const op = await s.propose(a, { idempotencyKey: "invoice-01", expiresAt: 100 }, "h", 2);
      await s.decide(op.id, "owner", "approved", null, 3);
      const receipt = {
        transactionHash: "tx-1",
        userOpHash: "uo",
        success: true,
        blockNumber: "9",
      };
      await s.recordExecution(op.id, "owner", receipt, 4);
      await expect(
        s.recordExecution(op.id, "owner", { ...receipt, transactionHash: "tx-2" }, 5),
      ).rejects.toThrow("Execution receipt conflict");
    }));
});
