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

test("rejects nonlocal gateway URLs and does not echo token in failures", async () => {
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
