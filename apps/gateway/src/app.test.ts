import { describe, expect, test } from "bun:test";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage, type Address, type Hex } from "viem";
import { sepoliaDeployment } from "@mandate/sdk";
import { Store } from "./store";
import { createApp } from "./app";
import type { Chain, Prepared } from "./chain";
import type { PaymentIntent } from "@mandate/protocol";
const owner = privateKeyToAccount(
  "0x59c6995e998f97a5a0044976f0945389dc9e86dae88c7a4f6d7e9c8f7d2b7a11",
);
const other = privateKeyToAccount(
  "0x8b3a350cf5b7a2c8d5e7f1a3b9c4d6e8f0a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9",
);
const account = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const prepared: Prepared = {
  tokenId: "1",
  epoch: "1",
  actionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex,
  entryPoint: sepoliaDeployment.entryPoint,
  validator: sepoliaDeployment.validator,
  op: {
    sender: account,
    nonce: "0",
    initCode: "0x",
    callData: "0x",
    accountGasLimits: "0x",
    preVerificationGas: "1",
    gasFees: "0x",
    paymasterAndData: "0x",
    signature: "0x",
  },
};
const intent = (key = "invoice-01", expiresAt = 1200): PaymentIntent => ({
  chainId: 11155111,
  account,
  fundingOwner: owner.address.toLowerCase(),
  token: sepoliaDeployment.token.toLowerCase(),
  recipient,
  amount: "1",
  businessReference: "test",
  idempotencyKey: key,
  expiresAt,
});
function fixture(clock = 1000) {
  const store = new Store(":memory:");
  let current = clock;
  const chain: Chain = {
    ownership: async (a) => ({
      owner: a === account ? owner.address.toLowerCase() : other.address.toLowerCase(),
      tokenId: "1",
      epoch: "1",
    }),
    verifyLogin: async (address, message, signature) =>
      owner.address.toLowerCase() === address.toLowerCase() &&
      (await verifyMessage({ address: owner.address as Address, message, signature })),
    balances: async () => ({
      native: "1",
      token: "1",
      allowance: "1",
      deposit: "1",
      tokenAddress: sepoliaDeployment.token,
    }),
    prepare: async () => prepared,
    verifyApproval: async (_intent, p, signature) =>
      p.actionHash === prepared.actionHash &&
      signature === (await owner.signMessage({ message: p.actionHash })),
    receipt: async (_p, hash) => ({
      transactionHash: hash,
      userOpHash: prepared.actionHash,
      success: true,
      blockNumber: "10",
    }),
  };
  return {
    store,
    chain,
    app: createApp(store, chain, { now: () => current }),
    setNow: (n: number) => {
      current = n;
    },
  };
}
async function call(
  app: (r: Request) => Promise<Response>,
  path: string,
  init: RequestInit = {},
  origin = "http://localhost:3000",
) {
  const headers = new Headers(init.headers);
  if (origin) headers.set("Origin", origin);
  return app(new Request(`http://127.0.0.1:3001${path}`, { ...init, headers }));
}
async function login(app: (r: Request) => Promise<Response>) {
  const challenge = await call(app, "/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ address: owner.address }),
  });
  const data = (await challenge.json()) as {
    id: string;
    message: string;
  };
  const sig = await owner.signMessage({ message: data.message });
  const verified = await call(app, "/auth/verify", {
    method: "POST",
    body: JSON.stringify({ id: data.id, signature: sig }),
  });
  return verified.headers.get("set-cookie")!.split(";")[0];
}
describe("gateway app", () => {
  test("authenticates challenge, rejects replay and expiry", async () => {
    const f = fixture();
    const c = await call(f.app, "/auth/challenge", {
      method: "POST",
      body: JSON.stringify({ address: owner.address }),
    });
    expect(c.status).toBe(200);
    const d = (await c.json()) as any;
    const sig = await owner.signMessage({ message: d.message });
    expect(
      (
        await call(f.app, "/auth/verify", {
          method: "POST",
          body: JSON.stringify({ id: d.id, signature: sig }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(f.app, "/auth/verify", {
          method: "POST",
          body: JSON.stringify({ id: d.id, signature: sig }),
        })
      ).status,
    ).toBe(401);
    const e = await call(f.app, "/auth/challenge", {
      method: "POST",
      body: JSON.stringify({ address: owner.address }),
    });
    const ed = (await e.json()) as any;
    f.setNow(1301);
    expect(
      (
        await call(f.app, "/auth/verify", {
          method: "POST",
          body: JSON.stringify({
            id: ed.id,
            signature: await owner.signMessage({ message: ed.message }),
          }),
        })
      ).status,
    ).toBe(401);
    f.store.close();
  });
  test("enforces exact origins", async () => {
    const f = fixture();
    expect(
      (await call(f.app, "/auth/challenge", { method: "POST", body: "{}" }, "http://evil.test"))
        .status,
    ).toBe(403);
    expect((await call(f.app, "/health", {}, "http://evil.test")).status).toBe(403);
    f.store.close();
  });
  test("returns one agent token and stores only its hash", async () => {
    const f = fixture();
    const cookie = await login(f.app);
    const created = await call(f.app, "/agents", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ name: "bot", account }),
    });
    expect(created.status).toBe(201);
    const result = (await created.json()) as any;
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(result.agent).not.toHaveProperty("tokenHash");
    expect(await f.store.authenticateAgent(result.token, 1000)).toBeNull();
    expect(
      (await f.store.authenticateAgent((await import("./app")).hashToken(result.token), 1000))?.id,
    ).toBe(result.agent.id);
    f.store.close();
  });
  test("isolates accounts and revoked agents", async () => {
    const f = fixture();
    const cookie = await login(f.app);
    const created = await call(f.app, "/agents", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ name: "bot", account }),
    });
    const a = (await created.json()) as any;
    expect(
      (await call(f.app, "/agent/account", { headers: { Authorization: `Bearer ${a.token}` } }))
        .status,
    ).toBe(200);
    await call(f.app, `/agents/${a.agent.id}/revoke`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(
      (await call(f.app, "/agent/account", { headers: { Authorization: `Bearer ${a.token}` } }))
        .status,
    ).toBe(401);
    f.store.close();
  });
  test("proposes idempotently and rejects different payload", async () => {
    const f = fixture();
    const cookie = await login(f.app);
    const created = await call(f.app, "/agents", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ name: "bot", account }),
    });
    const a = (await created.json()) as any;
    const headers = { Authorization: `Bearer ${a.token}` };
    const first = await call(
      f.app,
      "/agent/operations",
      { method: "POST", headers, body: JSON.stringify(intent()) },
      "",
    );
    expect(first.status).toBe(201);
    const op = (await first.json()) as any;
    const repeat = await call(
      f.app,
      "/agent/operations",
      { method: "POST", headers, body: JSON.stringify(intent()) },
      "",
    );
    expect(((await repeat.json()) as any).id).toBe(op.id);
    expect(
      (
        await call(
          f.app,
          "/agent/operations",
          { method: "POST", headers, body: JSON.stringify(intent("invoice-01", 1199)) },
          "",
        )
      ).status,
    ).toBe(409);
    f.store.close();
  });
  test("requires prepared valid approval and hides signature", async () => {
    const f = fixture();
    const cookie = await login(f.app);
    const created = await call(f.app, "/agents", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ name: "bot", account }),
    });
    const a = (await created.json()) as any;
    const h = { Authorization: `Bearer ${a.token}` };
    const p = await call(
      f.app,
      "/agent/operations",
      { method: "POST", headers: h, body: JSON.stringify(intent()) },
      "",
    );
    const op = (await p.json()) as any;
    expect(
      (
        await call(f.app, `/operations/${op.id}/approve`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: JSON.stringify({ signature: "0x1234" }),
        })
      ).status,
    ).toBe(409);
    await call(f.app, `/operations/${op.id}/prepare`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: "{}",
    });
    const sig = await owner.signMessage({ message: prepared.actionHash });
    const approved = await call(f.app, `/operations/${op.id}/approve`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ signature: sig }),
    });
    expect(approved.status).toBe(200);
    const body = (await approved.json()) as any;
    expect(body).not.toHaveProperty("signature");
    f.store.close();
  });
  test("accepts receipts only through chain verification", async () => {
    const f = fixture();
    const cookie = await login(f.app);
    const created = await call(f.app, "/agents", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ name: "bot", account }),
    });
    const a = (await created.json()) as any;
    const h = { Authorization: `Bearer ${a.token}` };
    const p = await call(
      f.app,
      "/agent/operations",
      { method: "POST", headers: h, body: JSON.stringify(intent()) },
      "",
    );
    const op = (await p.json()) as any;
    await call(f.app, `/operations/${op.id}/prepare`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: "{}",
    });
    const sig = await owner.signMessage({ message: prepared.actionHash });
    await call(f.app, `/operations/${op.id}/approve`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ signature: sig }),
    });
    const receipt = await call(f.app, `/operations/${op.id}/receipt`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({
        transactionHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    });
    expect(receipt.status).toBe(200);
    expect(((await receipt.json()) as any).execution.success).toBe(true);
    f.store.close();
  });
  test("allows originless authenticated GETs and denies originless writes", async () => {
    const f = fixture();
    const cookie = await login(f.app);
    expect((await call(f.app, "/auth/session", { headers: { Cookie: cookie } }, "")).status).toBe(
      200,
    );
    expect(
      (await call(f.app, "/auth/logout", { method: "POST", headers: { Cookie: cookie } }, ""))
        .status,
    ).toBe(403);
    f.store.close();
  });
  test("returns signed authorization only to the owner", async () => {
    const f = fixture();
    const cookie = await login(f.app);
    const created = await call(f.app, "/agents", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ name: "bot", account }),
    });
    const a = (await created.json()) as any;
    const h = { Authorization: `Bearer ${a.token}` };
    const p = await call(
      f.app,
      "/agent/operations",
      { method: "POST", headers: h, body: JSON.stringify(intent()) },
      "",
    );
    const op = (await p.json()) as any;
    await call(f.app, `/operations/${op.id}/prepare`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: "{}",
    });
    const sig = await owner.signMessage({ message: prepared.actionHash });
    await call(f.app, `/operations/${op.id}/approve`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ signature: sig }),
    });
    const auth = await call(f.app, `/operations/${op.id}/authorization`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: "{}",
    });
    expect(auth.status).toBe(200);
    expect(((await auth.json()) as any).signature).toBe(sig);
    expect(
      (
        await call(
          f.app,
          `/operations/${op.id}/authorization`,
          { method: "POST", headers: h, body: "{}" },
          "",
        )
      ).status,
    ).toBe(403);
    f.store.close();
  });
  test("rejects approval after a prepared quote expires", async () => {
    const f = fixture();
    const cookie = await login(f.app);
    const created = await call(f.app, "/agents", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ name: "bot", account }),
    });
    const a = (await created.json()) as any;
    const h = { Authorization: `Bearer ${a.token}` };
    const p = await call(
      f.app,
      "/agent/operations",
      { method: "POST", headers: h, body: JSON.stringify(intent("invoice-02", 1500)) },
      "",
    );
    const op = (await p.json()) as any;
    await call(f.app, `/operations/${op.id}/prepare`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: "{}",
    });
    f.setNow(1301);
    const sig = await owner.signMessage({ message: prepared.actionHash });
    expect(
      (
        await call(f.app, `/operations/${op.id}/approve`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: JSON.stringify({ signature: sig }),
        })
      ).status,
    ).toBe(409);
    f.store.close();
  });
  test("rejects when the quote expires during signature verification", async () => {
    const f = fixture();
    const cookie = await login(f.app);
    const created = await call(f.app, "/agents", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ name: "bot", account }),
    });
    const a = (await created.json()) as any;
    const proposal = await call(
      f.app,
      "/agent/operations",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${a.token}` },
        body: JSON.stringify(intent("invoice-03", 1500)),
      },
      "",
    );
    const op = (await proposal.json()) as any;
    await call(f.app, `/operations/${op.id}/prepare`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: "{}",
    });
    f.chain.verifyApproval = async () => {
      f.setNow(1301);
      return true;
    };
    const sig = await owner.signMessage({ message: prepared.actionHash });
    const response = await call(f.app, `/operations/${op.id}/approve`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({ signature: sig }),
    });
    expect(response.status).toBe(409);
    expect(
      ((await f.store.operationForOwner(op.id, owner.address.toLowerCase())) as any)?.status,
    ).toBe("approval_required");
    f.store.close();
  });
});
