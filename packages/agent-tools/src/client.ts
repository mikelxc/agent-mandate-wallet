import type { AgentConnection, Operation, PaymentIntent } from "@mandate/protocol";
import { parsePaymentIntent } from "@mandate/protocol";

export type GatewayFetch = typeof fetch;

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
    throw new Error("Gateway URL must be local HTTP");
  }
  if (
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "") ||
    (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
  ) {
    throw new Error("Gateway URL must be local HTTP");
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
  const token = options.token ?? process.env.MANDATE_AGENT_TOKEN;
  const baseUrl = gatewayUrl(options.baseUrl ?? process.env.MANDATE_GATEWAY_URL);
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!token) throw new Error("MANDATE_AGENT_TOKEN is required");

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
    getAccount: () => request<AgentConnection>("/agent/account"),
    proposePayment: async (input) =>
      request<Operation>("/agent/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsePaymentIntent(input)),
      }),
    getOperation: (id) => request<Operation>(`/agent/operations/${encodeURIComponent(id)}`),
  };
}

export type { AgentConnection, Operation, PaymentIntent };
