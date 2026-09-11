import { describe, expect, test } from "bun:test";
import { createGatewayClient } from "./client";

const NOW = Math.floor(Date.now() / 1000);
const intent = {
  chainId: 11155111,
  account: "0x1111111111111111111111111111111111111111",
  fundingOwner: "0x2222222222222222222222222222222222222222",
  token: "0x3333333333333333333333333333333333333333",
  recipient: "0x4444444444444444444444444444444444444444",
  amount: "1",
  businessReference: "Test",
  idempotencyKey: "test-1234",
  expiresAt: NOW + 3600,
};

function fakeFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init)) as typeof fetch;
}

test("sends bearer auth and exact intent to gateway", async () => {
  let seen: { url: string; init?: RequestInit } | undefined;
  const client = createGatewayClient({
    token: "secret-token",
    baseUrl: "http://127.0.0.1:3001",
    fetchImpl: fakeFetch((url, init) => {
      seen = { url, init };
      return Response.json({ id: "op-1", status: "approval_required" });
    }),
  });
  await client.proposePayment(intent);
  expect(seen?.init?.headers).toMatchObject({
    Authorization: "Bearer secret-token",
    "Content-Type": "application/json",
  });
  expect(JSON.parse(String(seen?.init?.body))).toEqual(intent);
});

test("rejects untrusted gateway URLs and does not echo token in failures", async () => {
  expect(() =>
    createGatewayClient({ token: "super-secret", baseUrl: "https://example.com" }),
  ).toThrow("local HTTP");
  const client = createGatewayClient({
    token: "super-secret",
    fetchImpl: fakeFetch(() => new Response("secret-token leaked", { status: 401 })),
  });
  await expect(client.getAccount()).rejects.toThrow("Gateway request failed (401)");
  await expect(client.getAccount()).rejects.not.toThrow("super-secret");
});

test("uses only approved HTTPS deployment hosts and never follows bearer-token redirects", async () => {
  const client = createGatewayClient({
    token: "secret",
    baseUrl: "https://way-leave.vercel.app/gateway",
    fetchImpl: fakeFetch((url, init) => {
      expect(url).toBe("https://way-leave.vercel.app/gateway/agent/account");
      expect(init?.redirect).toBe("error");
      return Response.json({});
    }),
  });
  await client.getAccount();
  for (const baseUrl of [
    "http://way-leave.vercel.app/gateway",
    "https://way-leave.vercel.app.evil.example/gateway",
    "https://way-leave.vercel.app/gateway?token=x",
    "https://name:secret@way-leave.vercel.app/gateway",
    "https://way-leave.vercel.app:8080/gateway",
  ]) {
    expect(() => createGatewayClient({ token: "secret", baseUrl })).toThrow("trusted Wayleave");
  }
});

test("adds readable setup guidance while preserving account fields", async () => {
  const client = createGatewayClient({
    token: "secret",
    fetchImpl: fakeFetch(() =>
      Response.json({
        agent: { account: "0x1111", owner: "0x2222" },
        balances: {
          token: "100000000",
          allowance: "0",
          deposit: "0",
          tokenAddress: "0x3C14067e0dbD276c083908C1D9D2f2Dc0A65ca41",
        },
        chainId: 11155111,
      }),
    ),
  });
  const account = (await client.getAccount()) as any;
  expect(account.balances.token).toBe("100000000");
  expect(account.human.balance).toBe("100 demo USDC");
  expect(account.human.nextSteps).toEqual([
    "Set a capped demo USDC allowance in the owner wallet",
    "Add a gas deposit for the account",
  ]);
});

test("adds an owner approval action and supports a local dashboard URL", async () => {
  const previous = process.env.WAYLEAVE_DASHBOARD_URL;
  process.env.WAYLEAVE_DASHBOARD_URL = "http://localhost:3020";
  try {
    const demoIntent = {
      ...intent,
      token: "0x3C14067e0dbD276c083908C1D9D2f2Dc0A65ca41",
      amount: "1",
    };
    const client = createGatewayClient({
      token: "secret",
      fetchImpl: fakeFetch(() =>
        Response.json({ id: "op-2", status: "approval_required", intent: demoIntent }),
      ),
    });
    const operation = (await client.proposePayment(demoIntent)) as any;
    expect(operation.approvalUrl).toBe("http://localhost:3020/?operation=op-2");
    expect(operation.human.amount).toBe("0.000001 demo USDC");
    expect(operation.human.status).toBe("Waiting for owner approval");
  } finally {
    if (previous === undefined) delete process.env.WAYLEAVE_DASHBOARD_URL;
    else process.env.WAYLEAVE_DASHBOARD_URL = previous;
  }
});

test("rejects an untrusted dashboard URL before returning an action link", async () => {
  process.env.WAYLEAVE_DASHBOARD_URL = "https://evil.example";
  try {
    const client = createGatewayClient({
      token: "secret",
      fetchImpl: fakeFetch(() =>
        Response.json({ id: "op-3", status: "approval_required", intent }),
      ),
    });
    await expect(client.proposePayment(intent)).rejects.toThrow("trusted Wayleave");
  } finally {
    delete process.env.WAYLEAVE_DASHBOARD_URL;
  }
});

test("describes execution evidence without overstating finality or delivery", async () => {
  const hashes = {
    success: "0x" + "a".repeat(64),
    failed: "0x" + "b".repeat(64),
  };
  const responses = [
    { id: "paid", status: "approved", intent, execution: { success: true, transactionHash: hashes.success } },
    { id: "failed", status: "approved", intent, execution: { success: false, transactionHash: hashes.failed } },
    { id: "bad-proof", status: "approved", intent, execution: { success: true, transactionHash: "0x123" } },
    { id: "approved", status: "approved", intent, approvalUrl: "http://localhost:3020/?operation=approved" },
    { id: "expired", status: "rejected", decisionReason: "intent expired", intent },
  ];
  const client = createGatewayClient({
    token: "secret",
    fetchImpl: fakeFetch(() => Response.json(responses.shift())),
  });
  const paid = (await client.getOperation("paid")) as any;
  expect(paid.human.status).toContain("confirmed onchain");
  expect(paid.human.status).toContain("finality");
  expect(paid.human.nextStep).toContain(hashes.success);
  const failed = (await client.getOperation("failed")) as any;
  expect(failed.human.status).toContain("failed onchain");
  expect(failed.human.nextStep).toContain("Do not automatically retry");
  const malformed = (await client.getOperation("bad-proof")) as any;
  expect(malformed.human.status).toBe("Execution evidence is incomplete");
  const approved = (await client.getOperation("approved")) as any;
  expect(approved.human.status).toBe("Approved; waiting for submission");
  expect(approved.human.nextStep).not.toContain("approval page");
  const expired = (await client.getOperation("expired")) as any;
  expect(expired.human.status).toBe("Payment request expired");
});

test("history tools bind to authenticated routes without accepting an account or upstream URL", async () => {
  const paths: string[] = [];
  const client = createGatewayClient({ token: "secret", fetchImpl: fakeFetch((url, init) => {
    paths.push(new URL(url).pathname + new URL(url).search);
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret" });
    return Response.json({ coverage: { status: "not_configured" } });
  }) });
  await client.listPayments({ chainId: 11155111, first: 10 });
  await client.summarizeSpending({ from: 100, groupBy: "merchant" });
  await client.getPaymentContext({ transactionHash: "0x" + "a".repeat(64) });
  expect(paths[0]).toBe("/agent/payments?chainId=11155111&first=10");
  expect(paths[1]).toBe("/agent/payments/summary?from=100&groupBy=merchant");
  expect(paths[2]).toStartWith("/agent/payments/context?transactionHash=0x");
});
