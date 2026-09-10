import { randomBytes, createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { isAddress, type Hex, decodeAbiParameters, hexToBytes, bytesToHex } from "viem";
import { createSiweMessage } from "viem/siwe";
import { canonicalIntentHash, parsePaymentIntent, ProtocolError } from "@mandate/protocol";
import { sepoliaDeployment, validLabel, type PasskeyPublicKey } from "@mandate/sdk";
import { Store } from "./store";
import type { Chain, Prepared } from "./chain";
import { createSiweAuth } from "./siwe";
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
function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}
function derInteger(value: bigint): Buffer {
  let hex = value.toString(16).padStart(64, "0");
  let b = Buffer.from(hex, "hex");
  while (b.length > 1 && b[0] === 0) b = b.subarray(1);
  if (b[0]! & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return Buffer.concat([Buffer.from([0x02, b.length]), b]);
}
export function verifyPasskeyAssertion(
  passkey: {
    x: string;
    y: string;
  },
  challenge: string,
  proof: Hex,
  expectedOrigin: string,
): boolean {
  try {
    const [authenticatorData, clientDataJSON, responseTypeLocation, r, s] = decodeAbiParameters(
      [
        { type: "bytes" },
        { type: "string" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bool" },
      ],
      proof,
    ) as [Hex, string, bigint, bigint, bigint, boolean];
    const parsed = JSON.parse(clientDataJSON) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };
    // The vendored verifier expects the byte offset of the response type token;
    // compact WebAuthn JSON produced by browsers starts it at byte 1. The
    // factory separately fixes the challenge property offset at byte 23.
    if (
      parsed.type !== "webauthn.get" ||
      parsed.challenge !== challenge ||
      parsed.origin !== expectedOrigin ||
      responseTypeLocation !== 1n
    )
      return false;
    const auth = hexToBytes(authenticatorData);
    if (auth.length < 37 || (auth[32]! & 0x01) === 0) return false;
    const rpHash = createHash("sha256").update(new URL(expectedOrigin).hostname).digest();
    if (!Buffer.from(auth.subarray(0, 32)).equals(rpHash)) return false;
    const clientHash = createHash("sha256").update(clientDataJSON, "utf8").digest();
    const x = Buffer.from(BigInt(passkey.x).toString(16).padStart(64, "0"), "hex");
    const y = Buffer.from(BigInt(passkey.y).toString(16).padStart(64, "0"), "hex");
    const spki = Buffer.concat([
      Buffer.from("3059301306072a8648ce3d020106082a8648ce3d03010703420004", "hex"),
      x,
      y,
    ]);
    const sig = Buffer.concat([
      Buffer.from([0x30, derInteger(r).length + derInteger(s).length]),
      derInteger(r),
      derInteger(s),
    ]);
    return verifySignature(
      "sha256",
      Buffer.concat([Buffer.from(authenticatorData.slice(2), "hex"), clientHash]),
      createPublicKey({ key: spki, format: "der", type: "spki" }),
      sig,
    );
  } catch {
    return false;
  }
}
export function createApp(
  store: Store,
  chain: Chain,
  options: {
    dashboardOrigin?: string;
    gatewayOrigin?: string;
    now?: () => number;
  } = {},
) {
  const dashboardOrigin = options.dashboardOrigin ?? "http://localhost:3000";
  const gatewayOrigin = options.gatewayOrigin ?? "http://127.0.0.1:3001";
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const siwe = createSiweAuth(store, chain, dashboardOrigin, now);
  async function limit(key: string) {
    if (!(await store.takeRateLimit(key, now()))) deny(429, "Request rate exceeded");
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
  function passkeyKey(value: unknown): PasskeyPublicKey {
    if (!value || typeof value !== "object") deny(400, "Invalid passkey public key");
    const x = (value as any).x,
      y = (value as any).y;
    if (!/^\d+$/.test(String(x)) || !/^\d+$/.test(String(y)))
      deny(400, "Invalid passkey public key");
    return { x: BigInt(String(x)), y: BigInt(String(y)) };
  }
  function credential(value: unknown): string {
    const v = text(value, "credentialId", 512);
    if (!/^[A-Za-z0-9_-]+$/.test(v)) deny(400, "Invalid credential ID");
    return v;
  }
  async function own(account: string, owner: string) {
    const current = await chain.ownership(account);
    if (current.owner.toLowerCase() !== owner.toLowerCase())
      deny(403, "Account ownership changed or belongs to another wallet");
    return current;
  }
  async function audit(
    owner: string,
    event: string,
    operationId: string | null = null,
    agentId: string | null = null,
  ) {
    await store.audit({ owner, event, operationId, agentId, details: null, createdAt: now() });
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
        const agent = bearer && (await store.authenticateAgent(hashToken(bearer), now()));
        if (!agent) deny(401, "Invalid or revoked agent connection");
        await limit(`agent:${agent.id}`);
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
          const op = await store.propose(agent, intent, canonicalIntentHash(intent), now());
          await audit(agent.owner, "payment_proposed", op.id, agent.id);
          return json({ ...op, approvalUrl: `${dashboardOrigin}/?operation=${op.id}` }, 201);
        }
        const id = path.match(/^\/agent\/operations\/([\w-]+)$/)?.[1];
        if (id && request.method === "GET")
          return json(
            (await store.operationForAgent(id, agent.id)) ?? deny(404, "Operation not found"),
          );
        deny(404, "Unknown agent route");
      }
      // Same-origin GET fetches may omit Origin. Every dashboard write requires the exact origin.
      if (request.method !== "GET" && origin !== dashboardOrigin)
        deny(403, "Dashboard origin required");
      if (path === "/auth/siwe/nonce" && request.method === "POST") {
        await limit("login");
        return json(await siwe.nonce());
      }
      if (path === "/auth/siwe/verify" && request.method === "POST") {
        await limit("login");
        const data = await body(request);
        const message = text(data.message, "message", 8192);
        const proof = signature(data.signature);
        try {
          const result = await siwe.verify(message, proof);
          headers.set("Set-Cookie", result.cookie);
          return json({ address: result.address, chainId: result.chainId });
        } catch (error) {
          deny(401, error instanceof Error ? error.message : "Sign-in verification failed");
        }
      }
      if (path === "/auth/challenge" && request.method === "POST") {
        await limit("login");
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
        await store.createChallenge({ id, message, address, expiresAt: now() + 300 });
        return json({ id, message });
      }
      if (path === "/auth/verify" && request.method === "POST") {
        await limit("login");
        const data = await body(request);
        const challenge = await store.getChallenge(text(data.id, "challenge"));
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
        if (!(await store.consumeChallenge(challenge.id, now())))
          deny(401, "Challenge already used");
        const token = secret();
        await store.createSession(hashToken(token), challenge.address, now() + 3600);
        headers.set(
          "Set-Cookie",
          `mandate_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${dashboardOrigin.startsWith("https:") ? "; Secure" : ""}`,
        );
        return json({ address: challenge.address });
      }
      const passkey = chain.passkey;
      if (path === "/passkey/availability" && request.method === "POST") {
        if (!passkey) deny(503, "Passkey onboarding is not configured");
        const data = await body(request);
        const label = text(data.label, "label", 32).toLowerCase();
        if (!validLabel(label)) deny(400, "Invalid label");
        return json({
          label,
          available: await passkey.labelAvailable(label),
          factory: passkey.factory,
          chainId: 11155111,
        });
      }
      if (path === "/passkey/registration/challenge" && request.method === "POST") {
        if (!passkey) deny(503, "Passkey onboarding is not configured");
        const data = await body(request);
        const label = text(data.label, "label", 32).toLowerCase();
        const key = passkeyKey(data.key);
        const credentialId = credential(data.credentialId);
        if (!validLabel(label)) deny(400, "Invalid label");
        if (!(await passkey.labelAvailable(label))) deny(409, "Name is unavailable");
        const account = await passkey.accountAddress(key);
        const deadline = BigInt(now() + 600);
        const registrationDigest = await passkey.registrationDigest(key, label, deadline);
        const id = crypto.randomUUID();
        const challenge = bytesToBase64Url(hexToBytes(registrationDigest));
        await store.createPasskeyChallenge({
          id,
          kind: "registration",
          account: account.toLowerCase(),
          label,
          credentialId,
          challenge,
          expiresAt: Number(deadline),
        });
        return json({
          id,
          challenge,
          digest: registrationDigest,
          deadline: deadline.toString(),
          account,
          rpId: new URL(dashboardOrigin).hostname,
          origin: dashboardOrigin,
        });
      }
      if (path === "/passkey/registration/complete" && request.method === "POST") {
        if (!passkey) deny(503, "Passkey onboarding is not configured");
        const data = await body(request);
        const c = await store.getPasskeyChallenge(text(data.id, "challenge"));
        if (!c || c.kind !== "registration" || c.usedAt !== null || c.expiresAt <= now())
          deny(401, "Challenge expired or used");
        const key = passkeyKey(data.key);
        const proof = signature(data.proof);
        if (
          text(data.label, "label", 32).toLowerCase() !== c.label ||
          credential(data.credentialId) !== c.credentialId
        )
          deny(400, "Challenge data does not match");
        if (
          !verifyPasskeyAssertion(
            { x: key.x.toString(), y: key.y.toString() },
            c.challenge!,
            proof,
            dashboardOrigin,
          )
        )
          deny(401, "Invalid passkey assertion");
        if (!(await store.consumePasskeyChallenge(c.id, now())))
          deny(401, "Challenge expired or used");
        const relayed = await passkey.relay(key, c.label!, BigInt(c.expiresAt), proof);
        await store.createPasskey({
          account: relayed.account.toLowerCase(),
          label: c.label!,
          credentialId: c.credentialId!,
          x: key.x.toString(),
          y: key.y.toString(),
          origin: dashboardOrigin,
          rpId: new URL(dashboardOrigin).hostname,
          createdAt: now(),
        });
        return json({
          account: relayed.account,
          label: c.label,
          tokenId: relayed.tokenId,
          transactionHash: relayed.transactionHash,
        });
      }
      if (path === "/passkey/login/challenge" && request.method === "POST") {
        const data = await body(request);
        const p = data.credentialId
          ? await store.passkeyByCredential(credential(data.credentialId))
          : data.account
            ? await store.passkeyByAccount(text(data.account, "account"))
            : null;
        if (!p) deny(404, "Passkey not found");
        const id = crypto.randomUUID();
        const challenge = bytesToBase64Url(randomBytes(32));
        await store.createPasskeyChallenge({
          id,
          kind: "login",
          account: p!.account,
          label: p!.label,
          credentialId: p!.credentialId,
          challenge,
          expiresAt: now() + 300,
        });
        return json({ id, challenge, account: p!.account, rpId: p!.rpId, origin: p!.origin });
      }
      if (path === "/passkey/login/verify" && request.method === "POST") {
        const data = await body(request);
        const c = await store.getPasskeyChallenge(text(data.id, "challenge"));
        if (!c || c.kind !== "login" || c.usedAt !== null || c.expiresAt <= now())
          deny(401, "Challenge expired or used");
        const p = await store.passkeyByAccount(c.account!);
        if (!p) deny(401, "Passkey not found");
        const ok = verifyPasskeyAssertion(p!, c.challenge!, signature(data.proof), dashboardOrigin);
        if (!ok || !(await store.consumePasskeyChallenge(c.id, now())))
          deny(401, "Invalid passkey assertion");
        const token = secret();
        await store.createSession(hashToken(token), p!.account, now() + 3600);
        headers.set(
          "Set-Cookie",
          `mandate_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${dashboardOrigin.startsWith("https:") ? "; Secure" : ""}`,
        );
        return json({ address: p!.account, label: p!.label });
      }
      const cookie = request.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)mandate_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (path === "/auth/logout" && request.method === "POST") {
        if (cookie) await store.deleteSession(hashToken(cookie));
        headers.set(
          "Set-Cookie",
          `mandate_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${dashboardOrigin.startsWith("https:") ? "; Secure" : ""}`,
        );
        return json({ ok: true });
      }
      const owner = cookie && (await store.session(hashToken(cookie), now()));
      if (!owner) deny(401, "Sign in with your wallet");
      await limit(`owner:${owner}`);
      if (path === "/auth/session" && request.method === "GET")
        return json({ address: owner, chainId: 11155111 });
      if (path === "/agents" && request.method === "GET")
        return json(await store.listAgents(owner));
      if (path === "/agents" && request.method === "POST") {
        const data = await body(request);
        const name = text(data.name, "name", 60);
        if (typeof data.account !== "string" || !isAddress(data.account))
          deny(400, "Invalid account");
        const account = (data.account as string).toLowerCase();
        await own(account, owner);
        const token = secret();
        const agent = await store.createAgent(
          { owner, account, name, tokenHash: hashToken(token), expiresAt: now() + 86400 },
          now(),
        );
        await audit(owner, "agent_connected", null, agent.id);
        return json({ agent, token }, 201);
      }
      const revoke = path.match(/^\/agents\/([\w-]+)\/revoke$/)?.[1];
      if (revoke && request.method === "POST") {
        if (!(await store.revokeAgent(revoke, owner, now())))
          deny(404, "Active connection not found");
        await audit(owner, "agent_revoked", null, revoke);
        return json({ ok: true });
      }
      if (path === "/operations" && request.method === "GET")
        return json(await store.listOperations(owner));
      if (path === "/audit" && request.method === "GET") return json(await store.listAudit(owner));
      const recovery = path.match(/^\/operations\/([\w-]+)\/authorization$/)?.[1];
      if (recovery && request.method === "POST") {
        const op =
          (await store.operationForOwner(recovery, owner)) ?? deny(404, "Operation not found");
        if (op.status !== "approved" || op.execution) deny(409, "No pending signed operation");
        await own(op.intent.account, owner);
        const p = (await store.getPrepared(recovery, owner)) as Prepared;
        const row = (await store.db
          .query("SELECT signature FROM signatures WHERE opId=?")
          .get(recovery)) as {
          signature: Hex;
        } | null;
        if (!p || !row || !(await chain.verifyApproval(op.intent, p, row.signature)))
          deny(409, "Signed operation no longer executable; check prior submission");
        return json({ prepared: p, signature: row.signature });
      }
      const match = path.match(/^\/operations\/([\w-]+)\/(prepare|approve|reject|receipt)$/);
      if (match && request.method === "POST") {
        const [, id, action] = match;
        const op = (await store.operationForOwner(id, owner)) ?? deny(404, "Operation not found");
        // Rejection remains possible after handover. Approval/signing must use the current owner.
        if (action === "reject") {
          const data = await body(request);
          const rejected = await store.decide(
            id,
            owner,
            "rejected",
            text(data.reason ?? "Rejected by owner", "reason", 240),
            now(),
          );
          await audit(owner, "payment_rejected", id);
          return json(rejected);
        }
        await own(op.intent.account, owner);
        if (action === "receipt") {
          const data = await body(request);
          const hash = text(data.transactionHash, "transaction hash");
          if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) deny(400, "Invalid transaction hash");
          const p = (await store.getPrepared(id, owner)) as Prepared | null;
          if (!p || op.status !== "approved") deny(409, "No approved operation");
          const result = await chain.receipt(p, hash as Hex);
          await store.recordExecution(id, owner, result, now());
          await audit(owner, result.success ? "payment_included" : "payment_failed", id);
          return json(await store.operationForOwner(id, owner));
        }
        if (op.status !== "approval_required") deny(409, "Operation already decided");
        if (op.intent.expiresAt <= now()) deny(409, "Request expired");
        if (action === "prepare") {
          const existing = await store.getPrepared(id, owner);
          if (existing && existing.preparedUntil > now()) return json(existing);
          const p = await chain.prepare(op.intent);
          Object.assign(p, { preparedUntil: Math.min(op.intent.expiresAt, now() + 300) });
          await store.setPrepared(id, owner, p, now());
          await audit(owner, "payment_prepared", id);
          return json(p);
        }
        const data = await body(request);
        const sig = signature(data.signature);
        const p = (await store.getPrepared(id, owner)) as Prepared | null;
        if (
          !p ||
          (
            p as Prepared & {
              preparedUntil: number;
            }
          ).preparedUntil <= now()
        )
          deny(409, "Prepare the payment again; quote expired");
        if (!(await chain.verifyApproval(op.intent, p, sig)))
          deny(401, "Invalid payment signature");
        if (
          (
            p as Prepared & {
              preparedUntil: number;
            }
          ).preparedUntil <= now()
        )
          deny(409, "Quote expired while verifying; prepare again");
        if ((await store.getPrepared(id, owner))?.actionHash !== p.actionHash)
          deny(409, "Prepared payment changed; review again");
        const approved = await store.recordApproval(id, owner, sig, now());
        await audit(owner, "payment_approved", id);
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
