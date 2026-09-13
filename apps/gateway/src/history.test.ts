import { expect, test } from "bun:test";
import { HistoryService, parseHistoryFilters, historyFromEnv, type IndexedTransfer } from "./history";
const account = "0x" + "1".repeat(40), merchant = "0x" + "2".repeat(40), token = "0x" + "3".repeat(40);
const tx = "0x" + "a".repeat(64), block = "0x" + "b".repeat(64);
const config = { chainId: 11155111, endpoint: "https://graph.example/subgraphs/id/demo", deployment: "QmDemo", startBlock: 10, token, apiKey: "secret" };
const metadata = { deployment: "QmDemo", hasIndexingErrors: false, block: { number: 50, hash: block, timestamp: 100 } };
function row(index = 0, overrides: Partial<IndexedTransfer> = {}): IndexedTransfer {
  return { id: `11155111:${tx}:${index}`, account, from: account, to: merchant, amount: "1000000", token, transactionHash: tx, logIndex: String(index), blockNumber: "40", blockHash: block, timestamp: "90", userOpHash: null, ...overrides };
}
function service(rows: IndexedTransfer[], extra: Record<string, unknown> = {}) {
  return new HistoryService([config], (async (_url, init) => {
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret" });
    const { variables, query } = JSON.parse(String(init?.body));
    expect(variables.account ?? variables.where.account).toBe(account);
    expect(query).not.toContain(account);
    return Response.json({ data: { paymentTransfers: rows, _meta: metadata, userOperations: [], ...extra } });
  }) as typeof fetch);
}
test("unconfigured and unavailable are distinct from no matching events", async () => {
  expect((await historyFromEnv({}).list(account)).coverage.status).toBe("not_configured");
  expect((await service([]).list(account)).coverage.status).toBe("indexed");
  expect((await new HistoryService([config], (async () => { throw Error("secret url"); }) as unknown as typeof fetch).list(account)).coverage.status).toBe("unavailable");
  expect((await service([], { _meta: { ...metadata, deployment: "other" } }).list(account)).coverage.status).toBe("unavailable");
});
test("isolates accounts and rejects malformed/duplicate upstream evidence", async () => {
  for (const rows of [[row(0, { account: merchant })], [row(), row()], [row(0, { amount: "-1" })]]) {
    const result = await service(rows).list(account);
    expect(result.items).toEqual([]);
    expect(result.coverage.status).toBe("unavailable");
  }
});
test("bounds pagination and preserves provenance, lag and indexing-error evidence", async () => {
  const result = await service([row(0), row(1)], { _meta: { ...metadata, hasIndexingErrors: true } }).list(account, { first: 1 });
  expect(result.items).toHaveLength(1);
  expect(result.nextCursor).toBe(row().id);
  expect(result.coverage.status).toBe("indexing_errors");
  expect(result.coverage.indexedBlock.number).toBe(50);
  expect(result.coverage.coverageStartBlock).toBe(10);
  expect((await service([]).list(account, { chainId: 5042002 })).coverage.status).toBe("not_configured");
  for (const input of [{ first: 101 }, { first: 0 }, { from: 12, to: 10 }, { cursor: "query { secret }" }, { chainId: -1 }]) expect(() => parseHistoryFilters(input)).toThrow();
});
test("summaries avoid burn/mint and deposits, and never claim complete historical purchases", async () => {
  const zero = "0x" + "0".repeat(40);
  const result = await service([row(), row(1, { to: zero }), row(2, { from: zero }), row(3, { to: account })]).summarize(account);
  expect(result.groups).toEqual([{ key: merchant, token, amount: "1000000", references: [row().id] }]);
  expect(result.complete).toBe(false);
  expect(result.boundedResultComplete).toBe(true);
  const truncated = await service(Array.from({ length: 101 }, (_, i) => row(i))).summarize(account);
  expect(truncated.truncated).toBe(true);
  expect(truncated.boundedResultComplete).toBe(false);
  await expect(service([]).summarize(account, { cursor: row().id })).rejects.toThrow();
});
test("context reports failed user operation separately and never asserts destination settlement", async () => {
  const result = await service([], { userOperations: [{ id: "op", account, transactionHash: tx, userOpHash: tx, success: false }] }).context(account, { transactionHash: tx });
  expect(result.userOperations[0].success).toBe(false);
  expect(result.settlement).toContain("Not established");
  expect(result.delivery).toContain("Not established");
  const leaked = await service([row()], { userOperations: [{ account: merchant, transactionHash: tx, userOpHash: tx, success: true }] }).context(account, { transactionHash: tx });
  expect(leaked.userOperations).toEqual([]);
  expect(leaked.transfers).toEqual([]);
});

test("environment config supports both chains and rejects partial or ambiguous providers", async () => {
  const env = {
    WAYLEAVE_GRAPH_ENDPOINT: config.endpoint, WAYLEAVE_GRAPH_DEPLOYMENT: config.deployment,
    WAYLEAVE_GRAPH_TOKEN: token, WAYLEAVE_GRAPH_START_BLOCK: "10", WAYLEAVE_GRAPH_CHAIN_ID: "11155111",
    WAYLEAVE_ARC_GRAPH_ENDPOINT: "https://graph.example/arc", WAYLEAVE_ARC_GRAPH_DEPLOYMENT: "QmArc",
    WAYLEAVE_ARC_GRAPH_TOKEN: token, WAYLEAVE_ARC_GRAPH_START_BLOCK: "20", WAYLEAVE_ARC_GRAPH_CHAIN_ID: "5042002",
  };
  const original = globalThis.fetch;
  const endpoints: string[] = [];
  globalThis.fetch = (async (url) => {
    endpoints.push(String(url));
    return Response.json({ data: { paymentTransfers: [], _meta: { ...metadata, deployment: String(url).endsWith("/arc") ? "QmArc" : "QmDemo" } } });
  }) as typeof fetch;
  try {
    const history = historyFromEnv(env);
    expect((await history.list(account)).coverage.chainId).toBe(11155111);
    expect((await history.list(account, { chainId: 5042002 })).coverage).toMatchObject({ status: "indexed", deployment: "QmArc", coverageStartBlock: 20 });
    expect(endpoints).toEqual([config.endpoint, env.WAYLEAVE_ARC_GRAPH_ENDPOINT]);
    expect(() => historyFromEnv({ ...env, WAYLEAVE_ARC_GRAPH_DEPLOYMENT: undefined })).toThrow("incomplete");
    expect(() => historyFromEnv({ ...env, WAYLEAVE_ARC_GRAPH_CHAIN_ID: "11155111" })).toThrow("5042002");
    expect(() => historyFromEnv({ ...env, WAYLEAVE_GRAPH_CHAIN_ID: "5042002" })).toThrow("Invalid");
  } finally { globalThis.fetch = original; }
});
