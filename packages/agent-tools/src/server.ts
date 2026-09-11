#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createGatewayClient } from "./client.js";
import { paymentIntentSchema, type PaymentIntentInput } from "./schema.js";

const server = new McpServer({ name: "wayleave-agent-tools", version: "0.1.1" });
const client = createGatewayClient();
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});
const failure = (error: unknown) => ({
  content: [
    { type: "text" as const, text: error instanceof Error ? error.message : "Tool request failed" },
  ],
  isError: true,
});

server.registerTool(
  "get_account",
  { description: "Get the connected agent account and balances." },
  async () => {
    try {
      return result(await client.getAccount());
    } catch (error) {
      return failure(error);
    }
  },
);
server.registerTool(
  "propose_payment",
  {
    description: "Submit a payment intent for human approval.",
    inputSchema: paymentIntentSchema.shape as any,
  },
  async (input: PaymentIntentInput) => {
    try {
      return result(await client.proposePayment(input));
    } catch (error) {
      return failure(error);
    }
  },
);
server.registerTool(
  "get_operation",
  {
    description: "Get the status of a proposed payment operation.",
    inputSchema: { id: z.string().min(1) } as any,
  },
  async ({ id }: { id: string }) => {
    try {
      return result(await client.getOperation(id));
    } catch (error) {
      return failure(error);
    }
  },
);

await server.connect(new StdioServerTransport());
