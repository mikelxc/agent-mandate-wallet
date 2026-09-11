import type { AgentConnection, Operation, PaymentIntent } from "@mandate/protocol";
import { parsePaymentIntent } from "@mandate/protocol";

export type GatewayFetch = typeof fetch;

const DEMO_USDC = "0x3c14067e0dbd276c083908c1d9d2f2dc0a65ca41";

type AccountPayload = {
  agent?: { account?: string; owner?: string };
  balances?: { token?: string; allowance?: string; deposit?: string; tokenAddress?: string };
  [key: string]: unknown;
};

type OperationPayload = Operation & {
  approvalUrl?: string;
  execution?: {
    transactionHash?: unknown;
    userOpHash?: unknown;
    success?: unknown;
    blockNumber?: unknown;
  };
};

function demoUsdc(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
  const units = BigInt(value);
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction} demo USDC` : `${whole} demo USDC`;
}

function resolveDashboardUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Dashboard URL must be local HTTP or a trusted Wayleave HTTPS gateway");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) ||
      (url.protocol === "https:" &&
        !url.port &&
        ["way-leave.vercel.app", "agent-mandate-wallet-web.vercel.app"].includes(url.hostname))
    )
  )
    throw new Error("Dashboard URL must be local HTTP or a trusted Wayleave HTTPS gateway");
  return url.toString().replace(/\/$/, "");
}

function enrichAccount(value: AccountPayload): AccountPayload {
  const balances = value.balances;
  if (!balances || balances.tokenAddress?.toLowerCase() !== DEMO_USDC) return value;
  const allowance = balances.allowance === "0";
  const deposit = balances.deposit === "0";
  const setup = [
    allowance ? "Set a capped demo USDC allowance in the owner wallet" : undefined,
    deposit ? "Add a gas deposit for the account" : undefined,
  ].filter(Boolean);
  return {
    ...value,
    human: {
      balance: demoUsdc(balances.token),
      allowance: demoUsdc(balances.allowance),
      deposit: `${balances.deposit ?? "0"} wei of gas deposit`,
      nextSteps: setup.length ? setup : ["You can propose a payment for owner approval"],
    },
  };
}

function enrichOperation(value: OperationPayload, dashboardUrl?: string): OperationPayload {
  const configuredDashboard = dashboardUrl;
  const approvalUrl = configuredDashboard
    ? `${configuredDashboard}/?operation=${encodeURIComponent(value.id)}`
    : value.approvalUrl;
  const execution = value.execution;
  const hasReceipt = Boolean(execution && typeof execution === "object");
  const validReceipt = Boolean(
    hasReceipt &&
      typeof execution?.success === "boolean" &&
      typeof execution.transactionHash === "string" &&
      /^0x[0-9a-f]{64}$/i.test(execution.transactionHash),
  );
  let status: string;
  let nextStep: string | undefined;
  if (validReceipt && execution!.success === true) {
    status = "Payment confirmed onchain (finality and delivery are separate)";
    nextStep = `View the Sepolia transaction: https://sepolia.etherscan.io/tx/${execution!.transactionHash}`;
  } else if (validReceipt && execution!.success === false) {
    status = "Payment execution failed onchain";
    nextStep = "Do not automatically retry; inspect the failed operation and approve a new request if needed.";
  } else if (hasReceipt) {
    status = "Execution evidence is incomplete";
    nextStep = "Do not assume payment completed; inspect the operation evidence before taking action.";
  } else if (value.status === "approval_required") {
    status = "Waiting for owner approval";
    nextStep = approvalUrl ? `Open the owner approval page: ${approvalUrl}` : undefined;
  } else if (value.status === "approved") {
    status = "Approved; waiting for submission";
    nextStep = "The owner approved this payment; wait for submission and onchain receipt evidence.";
  } else if (value.decisionReason?.toLowerCase().includes("expired")) {
    status = "Payment request expired";
    nextStep = "Create a new payment request with a fresh expiry.";
  } else {
    status = "Payment rejected";
    nextStep = value.decisionReason ? `Rejected: ${value.decisionReason}` : "Create a new request if payment is still needed.";
  }
  return {
    ...value,
    human: {
      amount: value.intent?.token?.toLowerCase() === DEMO_USDC ? demoUsdc(value.intent.amount) : undefined,
      status,
      nextStep,
    },
    ...(approvalUrl ? { approvalUrl } : {}),
  } as OperationPayload;
}

export type GatewayClient = {
  getAccount(): Promise<unknown>;
  proposePayment(input: unknown): Promise<Operation>;
  getOperation(id: string): Promise<Operation>;
};

function gatewayUrl(value: string | undefined): string {
  const candidate = value ?? "http://127.0.0.1:3001";
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Gateway URL must be local HTTP or a trusted Wayleave HTTPS gateway");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname) &&
        url.pathname === "/") ||
      (url.protocol === "https:" &&
        !url.port &&
        ["way-leave.vercel.app", "agent-mandate-wallet-web.vercel.app"].includes(url.hostname) &&
        ["/gateway", "/gateway/"].includes(url.pathname))
    )
  ) {
    throw new Error("Gateway URL must be local HTTP or a trusted Wayleave HTTPS gateway");
  }
  return url.toString().replace(/\/$/, "");
}

export function createGatewayClient(
  options: {
    token?: string;
    baseUrl?: string;
    fetchImpl?: GatewayFetch;
  } = {},
): GatewayClient {
  const token = options.token ?? process.env.WAYLEAVE_AGENT_TOKEN;
  const baseUrl = gatewayUrl(options.baseUrl ?? process.env.WAYLEAVE_GATEWAY_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!token) throw new Error("WAYLEAVE_AGENT_TOKEN is required");

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        redirect: "error",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(init?.headers ?? {}),
        },
      });
    } catch {
      throw new Error("Gateway request failed");
    }
    if (!response.ok) throw new Error(`Gateway request failed (${response.status})`);
    try {
      return (await response.json()) as T;
    } catch {
      throw new Error("Gateway returned invalid JSON");
    }
  }

  return {
    getAccount: async () => enrichAccount(await request<AccountPayload>("/agent/account")),
    proposePayment: async (input) =>
      enrichOperation(await request<OperationPayload>("/agent/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsePaymentIntent(input)),
      }), resolveDashboardUrl(process.env.WAYLEAVE_DASHBOARD_URL)),
    getOperation: async (id) => enrichOperation(
      await request<OperationPayload>(`/agent/operations/${encodeURIComponent(id)}`),
      resolveDashboardUrl(process.env.WAYLEAVE_DASHBOARD_URL),
    ),
  };
}

export type { AgentConnection, Operation, PaymentIntent };
