import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("a real MCP client discovers and invokes bounded history tools", async () => {
  const requested: string[] = [];
  const gateway = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    expect(request.headers.get("authorization")).toBe("Bearer integration-test-token");
    requested.push(new URL(request.url).pathname);
    return Response.json({ items: [], coverage: { kind: "indexed_history", status: "not_configured" } });
  } });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [new URL("./server.ts", import.meta.url).pathname],
    env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), WAYLEAVE_AGENT_TOKEN: "integration-test-token", WAYLEAVE_GATEWAY_URL: `http://127.0.0.1:${gateway.port}` },
    stderr: "pipe",
  });
  const client = new Client({ name: "history-integration-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools.map(t => t.name)).toEqual(expect.arrayContaining(["list_payments", "get_payment_context", "summarize_spending", "propose_crosschain_payment", "get_crosschain_payment"]));
    const response = await client.callTool({ name: "list_payments", arguments: { first: 10 } });
    expect(response.isError).not.toBe(true);
    expect(JSON.stringify(response.content)).toContain("not_configured");
    await client.callTool({ name: "get_payment_context", arguments: { transactionHash: "0x" + "a".repeat(64) } });
    await client.callTool({ name: "summarize_spending", arguments: { groupBy: "merchant" } });
    await client.callTool({ name: "propose_crosschain_payment", arguments: { account: "0x"+"1".repeat(40), fundingOwner: "0x"+"2".repeat(40), recipient: "0x"+"3".repeat(40), amount: "1000000", maxFee: "1000", businessReference: "merchant", idempotencyKey: "crosschain-test" } });
    await client.callTool({ name: "get_crosschain_payment", arguments: { id: "operation-test" } });
    expect(requested).toEqual(["/agent/payments", "/agent/payments/context", "/agent/payments/summary", "/agent/crosschain", "/agent/crosschain/operation-test"]);
  } finally { await client.close(); gateway.stop(true); }
}, 15_000);
