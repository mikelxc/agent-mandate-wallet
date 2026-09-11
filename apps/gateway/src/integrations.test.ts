import { afterEach, expect, test } from "bun:test";
import { createApp, hashToken } from "./app";
import { Store } from "./store";
import { HistoryService } from "./history";
import type { Chain } from "./chain";

const owner = "0x1111111111111111111111111111111111111111";
const account = "0x2222222222222222222222222222222222222222";
const other = "0x3333333333333333333333333333333333333333";
const token = "a".repeat(64);
const stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
async function fixture() {
  const store = new Store(":memory:"); stores.push(store);
  await store.db.ready;
  await store.createAgent({ owner, account, name: "History reader", tokenHash: hashToken(token), expiresAt: 2000 }, 1000);
  const calls: string[] = [];
  const history = new HistoryService();
  history.list = async (authorizedAccount) => { calls.push(authorizedAccount); return { items: [], nextCursor: null, coverage: {} as never }; };
  const chain = { ownership: async (value: string) => ({ owner: value === account ? owner : other, tokenId: "1", epoch: "1" }) } as Chain;
  const app = createApp(store, chain, { history, now: () => 1000 });
  return { app, store, calls, chain };
}
function request(path: string, bearer?: string) {
  return new Request(`http://127.0.0.1:3001${path}`, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
}
test("MCP history uses authenticated account, never a caller-supplied account", async () => {
  const f = await fixture();
  expect((await f.app(request("/agent/payments"))).status).toBe(401);
  expect((await f.app(request(`/agent/payments?account=${other}`, token))).status).toBe(200);
  expect(f.calls).toEqual([account]);
  expect((await f.app(request("/agent/payments?first=100000", token))).status).toBe(400);
});
test("owner history verifies current account ownership", async () => {
  const f = await fixture();
  await f.store.createSession(hashToken(token), owner, 2000);
  const get = (address: string) => f.app(new Request(`http://127.0.0.1:3001/history/payments?account=${address}`, { headers: { Cookie: `mandate_session=${token}` } }));
  expect((await get(other)).status).toBe(403);
  expect((await get(account)).status).toBe(200);
  expect(f.calls).toEqual([account]);
});
test("integration handlers inherit host, origin and no-store protections", async () => {
  const f = await fixture(); let invoked = 0;
  const app = createApp(f.store, f.chain, { routes: [async () => { invoked++; return Response.json({ ok: true }, { headers: { "Set-Cookie": "identity=test; HttpOnly" } }); }] });
  expect((await app(new Request("http://evil.test/identity"))).status).toBe(403);
  expect((await app(new Request("http://127.0.0.1:3001/identity", { headers: { Origin: "https://evil.test" } }))).status).toBe(403);
  expect(invoked).toBe(0);
  const response = await app(new Request("http://127.0.0.1:3001/identity"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("set-cookie")).toContain("identity=test");
});
