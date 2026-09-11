#!/usr/bin/env node
import { arcCctpRoute } from "@mandate/sdk";
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

const period = {
  chainId: z.number().int().positive().optional(),
  from: z.number().int().nonnegative().optional().describe("Inclusive Unix timestamp in seconds"),
  to: z.number().int().nonnegative().optional().describe("Inclusive Unix timestamp in seconds"),
};
server.registerTool("list_payments", {
  description: "Read indexed token activity for the connected account. Inspect coverage and indexing status before reasoning about missing payments. No spending authorization is granted.",
  inputSchema: { ...period, first: z.number().int().min(1).max(100).optional(), cursor: z.string().max(160).optional() } as any,
}, async (input: Parameters<typeof client.listPayments>[0]) => {
  try { return result(await client.listPayments(input)); } catch (error) { return failure(error); }
});
server.registerTool("get_payment_context", {
  description: "Inspect this account's indexed token effects and UserOperation success for a transaction. Outer transaction success alone does not prove payment or delivery. Use get_operation for private proposal and immediate receipt evidence.",
  inputSchema: { chainId: period.chainId, transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) } as any,
}, async (input: Parameters<typeof client.getPaymentContext>[0]) => {
  try { return result(await client.getPaymentContext(input)); } catch (error) { return failure(error); }
});
server.registerTool("summarize_spending", {
  description: "Sum a bounded page of indexed outgoing token transfers, excluding burns, mints and account funding. Amounts are token base units, not proven purchases. Check truncation and coverage before reporting a period total.",
  inputSchema: { ...period, groupBy: z.enum(["merchant", "chain"]).optional() } as any,
}, async (input: Parameters<typeof client.summarizeSpending>[0]) => {
  try { return result(await client.summarizeSpending(input)); } catch (error) { return failure(error); }
});

const crosschainInput = z.object({
  account: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  fundingOwner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amount: z.string().regex(/^[1-9][0-9]{0,77}$/).describe("Source debit in 6-decimal USDC base units; merchant receives debit minus actual Circle fee"),
  maxFee: z.string().regex(/^(0|[1-9][0-9]{0,77})$/).describe("Maximum Circle fee in 6-decimal USDC base units, less than amount"),
  businessReference: z.string().min(1).max(128), idempotencyKey: z.string().min(1).max(128),
}).strict();
server.registerTool("propose_crosschain_payment", {
  description: "Propose an exact Arc Testnet USDC debit for payment to Base Sepolia. Requires an owner-linked Arc agent connection and human approval; never signs or submits funds. Source gas is additional, merchant receipt is source debit minus actual Circle fee.",
  inputSchema: crosschainInput.shape as any,
}, async (input: z.infer<typeof crosschainInput>) => {
  try { return result(await client.proposeCrosschainPayment({
    ...crosschainInput.parse(input), version: 1, kind: "cctp_payment", sourceChainId: arcCctpRoute.sourceChainId,
    destinationChainId: arcCctpRoute.destinationChainId, sourceDomain: arcCctpRoute.sourceDomain,
    destinationDomain: arcCctpRoute.destinationDomain, sourceToken: arcCctpRoute.sourceToken,
    destinationToken: arcCctpRoute.destinationToken, amountSemantics: "source_debit", minFinalityThreshold: 2000,
  })); } catch (error) { return failure(error); }
});
server.registerTool("get_crosschain_payment", {
  description: "Read the connected account's cross-chain payment proposal and separate source/destination evidence. A source burn is not destination settlement or service delivery.",
  inputSchema: { id: z.string().min(1).max(128) } as any,
}, async ({ id }: { id: string }) => {
  try { return result(await client.getCrosschainPayment(id)); } catch (error) { return failure(error); }
});

await server.connect(new StdioServerTransport());
