import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage, verifyTypedData, toHex } from "viem";
import { Client } from "../packages/agent-tools/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../packages/agent-tools/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { createApp } from "../apps/gateway/src/app.ts";
import { Store } from "../apps/gateway/src/store.ts";
import { ownerAuthorization, sepoliaDeployment } from "../packages/sdk/src/index.ts";
import type { Chain, Prepared } from "../apps/gateway/src/chain.ts";

const owner = privateKeyToAccount(toHex(1, { size: 32 }));
const account = "0x00000000000000000000000000000000000000a1";
const token = sepoliaDeployment.token;
const recipient = "0x00000000000000000000000000000000000000c1";
const validator = "0x00000000000000000000000000000000000000d1";
const entryPoint = "0x00000000000000000000000000000000000000e1";
const actionHash = `0x${"11".repeat(32)}` as `0x${string}`;
const now = Math.floor(Date.now() / 1000);

const prepared: Prepared = {
  tokenId: "1",
  epoch: "0",
  actionHash,
  entryPoint,
  validator,
  op: {
    sender: account,
    nonce: "0",
    initCode: "0x",
    callData: "0x",
    accountGasLimits: "0x",
    preVerificationGas: "0",
    gasFees: "0x",
    paymasterAndData: "0x",
    signature: "0x",
  },
};

const chain: Chain = {
  async ownership(address) {
    if (address.toLowerCase() !== account) throw new Error("unknown account");
    return { owner: owner.address.toLowerCase(), tokenId: "1", epoch: "0" };
  },
  async verifyLogin(address, message, signature) {
    return (
      owner.address.toLowerCase() === address.toLowerCase() &&
      (await verifyMessage({ address: owner.address, message, signature }))
    );
  },
  async balances() {
    return {
      native: "1000000000000000000",
      token: "100000000",
      allowance: "100000000",
      deposit: "1000000000000000000",
      tokenAddress: token,
    };
  },
  async prepare() {
    return prepared;
  },
  async verifyApproval(intent, payload, signature) {
    return verifyTypedData({
      address: owner.address,
      ...ownerAuthorization(
        11155111,
        validator,
        account,
        BigInt(payload.tokenId),
        BigInt(payload.epoch),
        payload.actionHash,
      ),
      signature,
    });
  },
  async receipt(payload, hash) {
    return {
      transactionHash: hash,
      userOpHash: payload.actionHash,
      success: true,
      blockNumber: "1",
    };
  },
};

const dir = mkdtempSync(join(tmpdir(), "mandate-gateway-smoke-"));
const store = new Store(join(dir, "gateway.sqlite"));
let server: ReturnType<typeof Bun.serve> | undefined;
let transport: StdioClientTransport | undefined;
try {
  let handler: (request: Request) => Response | Promise<Response> = () => new Response("starting");
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (request) => handler(request) });
  const gatewayOrigin = server.url.origin;
  handler = createApp(store, chain, { gatewayOrigin, dashboardOrigin: "http://localhost:3000" });
  const origin = server.url.origin;
  const dashboard = "http://localhost:3000";
  const request = async (path: string, init: RequestInit = {}, cookie?: string) =>
    fetch(`${origin}${path}`, {
      ...init,
      headers: { origin: dashboard, ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
    });
  const challengeResponse = await request("/auth/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: owner.address }),
  });
  if (!challengeResponse.ok) throw new Error("challenge failed");
  const challenge = (await challengeResponse.json()) as { id: string; message: string };
  const signature = await owner.signMessage({ message: challenge.message });
  const verifyResponse = await request("/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: challenge.id, signature }),
  });
  if (!verifyResponse.ok) throw new Error("login failed");
  const cookie = verifyResponse.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("session cookie missing");
  const agentResponse = await request(
    "/agents",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "smoke", account }),
    },
    cookie,
  );
  if (!agentResponse.ok) throw new Error("agent creation failed");
  const agent = (await agentResponse.json()) as { agent: { id: string }; token: string };

  transport = new StdioClientTransport({
    command: "node",
    args: ["packages/agent-tools/dist/cli.js"],
    env: {
      ...process.env,
      WAYLEAVE_AGENT_TOKEN: agent.token,
      WAYLEAVE_GATEWAY_URL: origin,
    },
  });
  const mcp = new Client({ name: "gateway-smoke", version: "0.1.0" }, {});
  await mcp.connect(transport);
  const tools = await mcp.listTools();
  if (
    tools.tools.length !== 3 ||
    !["get_account", "propose_payment", "get_operation"].every((name) =>
      tools.tools.some((tool) => tool.name === name),
    )
  )
    throw new Error("unexpected MCP tool list");
  const intent = {
    chainId: 11155111,
    account,
    fundingOwner: owner.address,
    token,
    recipient,
    amount: "3",
    businessReference: "smoke",
    idempotencyKey: "smoke-1234",
    expiresAt: now + 300,
  };
  const proposed = await mcp.callTool({ name: "propose_payment", arguments: intent });
  if (proposed.isError) throw new Error("proposal failed");
  const operation = JSON.parse((proposed.content[0] as { text: string }).text) as { id: string };
  const repeated = await mcp.callTool({ name: "propose_payment", arguments: intent });
  if (
    repeated.isError ||
    JSON.parse((repeated.content[0] as { text: string }).text).id !== operation.id
  )
    throw new Error("idempotency failed");
  const fetched = await mcp.callTool({ name: "get_operation", arguments: { id: operation.id } });
  if (fetched.isError) throw new Error("operation fetch failed");
  const prepResponse = await request(
    `/operations/${operation.id}/prepare`,
    { method: "POST" },
    cookie,
  );
  if (!prepResponse.ok) throw new Error("prepare failed");
  const approval = ownerAuthorization(11155111, validator, account, 1n, 0n, actionHash);
  const approvalSignature = await owner.signTypedData(approval);
  const approveResponse = await request(
    `/operations/${operation.id}/approve`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature: approvalSignature }),
    },
    cookie,
  );
  if (!approveResponse.ok) throw new Error("approval failed");
  const approved = await mcp.callTool({ name: "get_operation", arguments: { id: operation.id } });
  const approvedData = JSON.parse((approved.content[0] as { text: string }).text);
  if (approvedData.status !== "approved" || "signature" in approvedData)
    throw new Error("approval lifecycle failed");
  const revokeResponse = await request(
    `/agents/${agent.agent.id}/revoke`,
    { method: "POST" },
    cookie,
  );
  if (!revokeResponse.ok) throw new Error("revoke failed");
  const revoked = await mcp.callTool({ name: "get_account", arguments: {} });
  if (!revoked.isError) throw new Error("revoked token still authenticated");
  await mcp.close();
  console.log(
    "gateway smoke: 3 MCP tools, login, idempotency, approval, redaction, revoke: passed",
  );
  console.log("chain: simulated");
} finally {
  await transport?.close().catch(() => undefined);
  server?.stop();
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
