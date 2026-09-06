import { randomBytes, createHash } from "node:crypto";
import { isAddress, type Hex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { canonicalIntentHash, parsePaymentIntent, ProtocolError } from "@mandate/protocol";
import { sepoliaDeployment } from "@mandate/sdk";
import { Store } from "./store";
import type { Chain, Prepared } from "./chain";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const secret = () => randomBytes(32).toString("hex");
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function deny(status: number, message: string): never {
  throw new HttpError(status, message);
}
export function createApp(
  store: Store,
  chain: Chain,
  options: { dashboardOrigin?: string; gatewayOrigin?: string; now?: () => number } = {},
) {
  const dashboardOrigin = options.dashboardOrigin ?? "http://localhost:3000";
  const gatewayOrigin = options.gatewayOrigin ?? "http://127.0.0.1:3001";
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const counts = new Map<string, { count: number; expiry: number }>();
  function limit(key: string) {
    for (const [k, v] of counts) if (v.expiry <= now()) counts.delete(k);
    const row = counts.get(key) ?? { count: 0, expiry: now() + 60 };
    if (++row.count > 120 || counts.size > 1000) deny(429, "Request rate exceeded");
    counts.set(key, row);
  }
  async function body(request: Request) {
    const reader = request.body?.getReader();
    if (!reader) deny(400, "JSON body required");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      length += value.length;
      if (length > 16384) {
        await reader!.cancel();
        deny(413, "Request too large");
      }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) deny(400, "JSON object required");
    return data as Record<string, unknown>;
  }
  function text(value: unknown, name: string, max = 120): string {
    if (typeof value !== "string" || !value.trim() || value.length > max)
      deny(400, `Invalid ${name}`);
    return value as string;
  }
  function signature(value: unknown): Hex {
    if (
      typeof value !== "string" ||
      !/^0x[0-9a-fA-F]{2,8192}$/.test(value) ||
      value.length % 2 !== 0
    )
      deny(400, "Invalid signature");
    return value as Hex;
  }
  async function own(account: string, owner: string) {
    const current = await chain.ownership(account);
    if (current.owner.toLowerCase() !== owner.toLowerCase())
      deny(403, "Account ownership changed or belongs to another wallet");
    return current;
  }
  function audit(
    owner: string,
    event: string,
    operationId: string | null = null,
    agentId: string | null = null,
  ) {
    store.audit({ owner, event, operationId, agentId, details: null, createdAt: now() });
  }
  return async function fetch(request: Request): Promise<Response> {
    const origin = request.headers.get("origin");
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    if (origin === dashboardOrigin) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Credentials", "true");
    }
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers });
    try {
      const url = new URL(request.url);
      if (url.origin !== gatewayOrigin) deny(403, "Unexpected gateway host");
      if (origin && origin !== dashboardOrigin) deny(403, "Unexpected origin");
      if (request.method === "OPTIONS") {
        if (origin !== dashboardOrigin) deny(403, "Unexpected origin");
        headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        return new Response(null, { status: 204, headers });
      }
      const path = url.pathname;
      if (path === "/health" && request.method === "GET")
        return json({ ok: true, chainId: 11155111, mode: "human_approval" });
      if (path.startsWith("/agent/")) {
        const bearer = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
        const agent = bearer && store.authenticateAgent(hashToken(bearer), now());
        if (!agent) deny(401, "Invalid or revoked agent connection");
        limit(`agent:${agent.id}`);
        await own(agent.account, agent.owner);
        if (path === "/agent/account" && request.method === "GET")
          return json({
            agent,
            balances: await chain.balances(agent.account, agent.owner),
            permissions: ["read", "propose"],
            chainId: 11155111,
          });
        if (path === "/agent/operations" && request.method === "POST") {
          const intent = parsePaymentIntent(await body(request), now());
          if (
            intent.account !== agent.account ||
            intent.fundingOwner !== agent.owner ||
            intent.token !== sepoliaDeployment.token.toLowerCase()
          )
            deny(403, "Request outside agent account or demo token scope");
          const op = store.propose(agent, intent, canonicalIntentHash(intent), now());
          audit(agent.owner, "payment_proposed", op.id, agent.id);
          return json({ ...op, approvalUrl: `${dashboardOrigin}/?operation=${op.id}` }, 201);
        }
        const id = path.match(/^\/agent\/operations\/([\w-]+)$/)?.[1];
        if (id && request.method === "GET")
          return json(store.operationForAgent(id, agent.id) ?? deny(404, "Operation not found"));
        deny(404, "Unknown agent route");
      }
      // Same-origin GET fetches may omit Origin. Every dashboard write requires the exact origin.
      if (request.method !== "GET" && origin !== dashboardOrigin)
        deny(403, "Dashboard origin required");
      if (path === "/auth/challenge" && request.method === "POST") {
        limit("login");
        const data = await body(request);
        if (typeof data.address !== "string" || !isAddress(data.address))
          deny(400, "Invalid wallet address");
        const address = (data.address as string).toLowerCase();
        const id = crypto.randomUUID();
        const nonce = secret();
        const message = createSiweMessage({
          domain: new URL(dashboardOrigin).host,
          address: address as Hex,
          statement: "Sign in to Mandate. This grants no spending authority.",
          uri: dashboardOrigin,
          version: "1",
          chainId: 11155111,
          nonce,
          issuedAt: new Date(now() * 1000),
          expirationTime: new Date((now() + 300) * 1000),
        });
        store.createChallenge({ id, message, address, expiresAt: now() + 300 });
        return json({ id, message });
      }
      if (path === "/auth/verify" && request.method === "POST") {
        limit("login");
        const data = await body(request);
        const challenge = store.getChallenge(text(data.id, "challenge"));
        if (!challenge || challenge.usedAt !== null || challenge.expiresAt <= now())
          deny(401, "Challenge expired or used");
        if (
          !(await chain.verifyLogin(
            challenge.address,
            challenge.message,
            signature(data.signature),
          ))
        )
          deny(401, "Signature does not match wallet");
        if (!store.consumeChallenge(challenge.id, now())) deny(401, "Challenge already used");
        const token = secret();
        store.createSession(hashToken(token), challenge.address, now() + 3600);
        headers.set(
          "Set-Cookie",
          `mandate_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
        );
        return json({ address: challenge.address });
      }
      const cookie = request.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)mandate_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      const owner = cookie && store.session(hashToken(cookie), now());
      if (!owner) deny(401, "Sign in with your wallet");
      limit(`owner:${owner}`);
      if (path === "/auth/session" && request.method === "GET") return json({ address: owner });
      if (path === "/auth/logout" && request.method === "POST") {
        store.deleteSession(hashToken(cookie!));
        headers.set("Set-Cookie", "mandate_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
        return json({ ok: true });
      }
      if (path === "/agents" && request.method === "GET") return json(store.listAgents(owner));
      if (path === "/agents" && request.method === "POST") {
        const data = await body(request);
        const name = text(data.name, "name", 60);
        if (typeof data.account !== "string" || !isAddress(data.account))
          deny(400, "Invalid account");
        const account = (data.account as string).toLowerCase();
        await own(account, owner);
        const token = secret();
        const agent = store.createAgent(
          { owner, account, name, tokenHash: hashToken(token), expiresAt: now() + 86400 },
          now(),
        );
        audit(owner, "agent_connected", null, agent.id);
        return json({ agent, token }, 201);
      }
      const revoke = path.match(/^\/agents\/([\w-]+)\/revoke$/)?.[1];
      if (revoke && request.method === "POST") {
        if (!store.revokeAgent(revoke, owner, now())) deny(404, "Active connection not found");
        audit(owner, "agent_revoked", null, revoke);
        return json({ ok: true });
      }
      if (path === "/operations" && request.method === "GET")
        return json(store.listOperations(owner));
      if (path === "/audit" && request.method === "GET") return json(store.listAudit(owner));
      const recovery = path.match(/^\/operations\/([\w-]+)\/authorization$/)?.[1];
      if (recovery && request.method === "POST") {
        const op = store.operationForOwner(recovery, owner) ?? deny(404, "Operation not found");
        if (op.status !== "approved" || op.execution) deny(409, "No pending signed operation");
        await own(op.intent.account, owner);
        const p = store.getPrepared(recovery, owner) as Prepared;
        const row = store.db
          .query("SELECT signature FROM signatures WHERE opId=?")
          .get(recovery) as { signature: Hex } | null;
        if (!p || !row || !(await chain.verifyApproval(op.intent, p, row.signature)))
          deny(409, "Signed operation no longer executable; check prior submission");
        return json({ prepared: p, signature: row.signature });
      }
      const match = path.match(/^\/operations\/([\w-]+)\/(prepare|approve|reject|receipt)$/);
      if (match && request.method === "POST") {
        const [, id, action] = match;
        const op = store.operationForOwner(id, owner) ?? deny(404, "Operation not found");
        // Rejection remains possible after handover. Approval/signing must use the current owner.
        if (action === "reject") {
          const data = await body(request);
          const rejected = store.decide(
            id,
            owner,
            "rejected",
            text(data.reason ?? "Rejected by owner", "reason", 240),
            now(),
          );
          audit(owner, "payment_rejected", id);
          return json(rejected);
        }
        await own(op.intent.account, owner);
        if (action === "receipt") {
          const data = await body(request);
          const hash = text(data.transactionHash, "transaction hash");
          if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) deny(400, "Invalid transaction hash");
          const p = store.getPrepared(id, owner) as Prepared | null;
          if (!p || op.status !== "approved") deny(409, "No approved operation");
          const result = await chain.receipt(p, hash as Hex);
          store.recordExecution(id, owner, result, now());
          audit(owner, result.success ? "payment_included" : "payment_failed", id);
          return json(store.operationForOwner(id, owner));
        }
        if (op.status !== "approval_required") deny(409, "Operation already decided");
        if (op.intent.expiresAt <= now()) deny(409, "Request expired");
        if (action === "prepare") {
          const existing = store.getPrepared(id, owner);
          if (existing && existing.preparedUntil > now()) return json(existing);
          const p = await chain.prepare(op.intent);
          Object.assign(p, { preparedUntil: Math.min(op.intent.expiresAt, now() + 300) });
          store.setPrepared(id, owner, p, now());
          audit(owner, "payment_prepared", id);
          return json(p);
        }
        const data = await body(request);
        const sig = signature(data.signature);
        const p = store.getPrepared(id, owner) as Prepared | null;
        if (!p || (p as Prepared & { preparedUntil: number }).preparedUntil <= now())
          deny(409, "Prepare the payment again; quote expired");
        if (!(await chain.verifyApproval(op.intent, p, sig)))
          deny(401, "Invalid payment signature");
        if ((p as Prepared & { preparedUntil: number }).preparedUntil <= now())
          deny(409, "Quote expired while verifying; prepare again");
        if (store.getPrepared(id, owner)?.actionHash !== p.actionHash)
          deny(409, "Prepared payment changed; review again");
        const approved = store.recordApproval(id, owner, sig, now());
        audit(owner, "payment_approved", id);
        return json(approved);
      }
      deny(404, "Route not found");
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof ProtocolError || error instanceof SyntaxError)
        return json({ error: error.message }, 400);
      const message = error instanceof Error ? error.message : "";
      if (/conflict|not pending|expired|not prepared|not found/.test(message))
        return json({ error: message }, 409);
      // Do not reflect RPC/provider errors that might contain credentials or signed payloads.
      return json(
        {
          error:
            "Operation could not be completed. Check ownership, token allowance, balance and gas deposit, then retry.",
        },
        422,
      );
    }
  };
}
