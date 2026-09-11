import { authenticatePortableAgent, parseCctpIntent } from "@mandate/sdk";
import { privateKeyToAccount } from "viem/accounts";
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
        url.hostname === "www.wayleave.xyz")
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

export type HistoryInput = { chainId?: number; from?: number; to?: number; first?: number; cursor?: string };

function historyQuery(input: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined) query.set(key, String(value));
  return query.toString();
}

export type GatewayClient = {
  proposeCrosschainPayment(input: unknown): Promise<unknown>;
  getCrosschainPayment(id: string): Promise<unknown>;
  listPayments(input?: HistoryInput): Promise<unknown>;
  getPaymentContext(input: { chainId?: number; transactionHash: string }): Promise<unknown>;
  summarizeSpending(input?: Omit<HistoryInput, "first" | "cursor"> & { groupBy?: "merchant" | "chain" }): Promise<unknown>;
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
        url.hostname === "www.wayleave.xyz" &&
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
    portableIdentity?: { identity: string; name: string; privateKey: `0x${string}` };
    account?: string;
  } = {},
): GatewayClient {
  const configuredToken = options.token ?? process.env.WAYLEAVE_AGENT_TOKEN;
  const baseUrl = gatewayUrl(options.baseUrl ?? process.env.WAYLEAVE_GATEWAY_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  const portable = options.portableIdentity ?? (process.env.WAYLEAVE_ENS_IDENTITY ? {
    identity: process.env.WAYLEAVE_ENS_IDENTITY,
    name: process.env.WAYLEAVE_ENS_AGENT_NAME ?? "",
    privateKey: (process.env.WAYLEAVE_ENS_AGENT_PRIVATE_KEY ?? "") as `0x${string}`,
  } : undefined);
  if (!configuredToken && !portable) throw new Error("WAYLEAVE_AGENT_TOKEN or portable identity configuration is required");
  if (!configuredToken && portable && (!portable.name || !/^0x[0-9a-fA-F]{64}$/.test(portable.privateKey)))
    throw new Error("Portable identity requires an enrolled agent name and locally configured signing key");
  const selectedAccount = options.account ?? process.env.WAYLEAVE_ACCOUNT;
  if (selectedAccount && !/^0x[0-9a-fA-F]{40}$/.test(selectedAccount)) throw new Error("WAYLEAVE_ACCOUNT must be an address");
  let session: { token: string; expiresAt: number } | undefined;
  let authentication: Promise<string> | undefined;
  async function bearer(): Promise<string> {
    if (configuredToken) return configuredToken;
    if (session && session.expiresAt > Date.now() / 1000 + 30) return session.token;
    if (authentication) return authentication;
    authentication = (async () => {
      try {
        const signer = privateKeyToAccount(portable!.privateKey);
        const result = await authenticatePortableAgent({
          gateway: baseUrl, identity: portable!.identity, name: portable!.name, expectedKey: signer.address,
          fetch: ((url: Parameters<typeof fetch>[0], init?: RequestInit) => {
            const target = String(url);
            if (![`${baseUrl}/identity/challenge`, `${baseUrl}/identity/verify`].includes(target)) throw new Error("Unexpected identity endpoint");
            return fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) });
          }) as typeof fetch,
          signMessage: async message => {
            const proof = JSON.parse(message.split("\n").at(-1)!);
            if (String(proof.key).toLowerCase() !== signer.address.toLowerCase() || !/^[a-f0-9]{64}$/.test(proof.nonce) || proof.expiresAt > Date.now() / 1000 + 305)
              throw new Error("Unexpected identity signing key or challenge");
            return signer.signMessage({ message });
          },
        });
        if (!/^[a-f0-9]{64}$/.test(result.token) || result.session?.kind !== "agent" ||
            !Number.isSafeInteger(result.session?.expiresAt) || result.session.expiresAt <= Date.now() / 1000 || result.session.expiresAt > Date.now() / 1000 + 905)
          throw new Error("Invalid portable session");
        session = { token: result.token, expiresAt: result.session.expiresAt };
        return session.token;
      } catch { throw new Error("Portable agent authentication failed; check enrollment, key and gateway configuration"); }
      finally { authentication = undefined; }
    })();
    return authentication;
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await bearer();
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        redirect: "error",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(!configuredToken && selectedAccount ? { "x-wayleave-account": selectedAccount } : {}),
          ...(init?.headers ?? {}),
        },
      });
    } catch {
      throw new Error("Gateway request failed");
    }
    if (!response.ok) {
      if (response.status === 401 && !configuredToken) session = undefined;
      // Never replay a payment proposal automatically after authentication failure.
      throw new Error(`Gateway request failed (${response.status})`);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new Error("Gateway returned invalid JSON");
    }
  }

  return {
    proposeCrosschainPayment: input => request("/agent/crosschain", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: parseCctpIntent(input) }),
    }),
    getCrosschainPayment: id => request(`/agent/crosschain/${encodeURIComponent(id)}`),
    listPayments: (input = {}) => request(`/agent/payments?${historyQuery(input)}`),
    getPaymentContext: (input) => request(`/agent/payments/context?${historyQuery(input)}`),
    summarizeSpending: (input = {}) => request(`/agent/payments/summary?${historyQuery(input)}`),
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
