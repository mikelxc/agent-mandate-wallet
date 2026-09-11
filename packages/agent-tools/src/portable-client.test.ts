import { expect, test } from "bun:test";
import { identityProofMessage, portableIdentityDeployment, type IdentityProof } from "@mandate/sdk";
import { privateKeyToAccount } from "viem/accounts";
import { createGatewayClient } from "./client";
const privateKey = ("0x" + "1".repeat(64)) as `0x${string}`;
const key = privateKeyToAccount(privateKey).address;
const portableIdentity = { identity: "desk.wayleave.eth", name: "codex.desk.wayleave.eth", privateKey };
function fixture(transform: (proof: IdentityProof) => IdentityProof = proof => proof) {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    expect(init?.redirect).toBe("error");
    expect(String(init?.body ?? "")).not.toContain(privateKey);
    if (path.endsWith("/challenge")) {
      const proof = transform({ nonce: "a".repeat(64), audience: "http://127.0.0.1:3001", deployment: portableIdentityDeployment, kind: "agent", name: portableIdentity.name, identity: portableIdentity.identity, registration: "0x01", key, generation: "1", expiresAt: Math.floor(Date.now()/1000)+250 });
      return Response.json({ proof, message: identityProofMessage(proof) });
    }
    if (path.endsWith("/verify")) return Response.json({ token: "b".repeat(64), session: { kind: "agent", audience: "http://127.0.0.1:3001", membership: { name: portableIdentity.name }, identity: { name: portableIdentity.identity, deployment: portableIdentityDeployment }, expiresAt: Math.floor(Date.now()/1000)+800 } });
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${"b".repeat(64)}` });
    return Response.json({ ok: true });
  }) as typeof fetch;
  return { calls, impl };
}
test("portable auth signs once locally and reuses a scoped session for concurrent reads", async () => {
  const { calls, impl } = fixture();
  const client = createGatewayClient({ portableIdentity, account: "0x"+"4".repeat(40), fetchImpl: (async (url, init) => {
    if (String(url).includes("/agent/")) expect(init?.headers).toMatchObject({ "x-wayleave-account": "0x"+"4".repeat(40) });
    return impl(url, init);
  }) as typeof fetch });
  await Promise.all([client.getAccount(), client.listPayments()]);
  expect(calls.filter(x => x.endsWith("/challenge"))).toHaveLength(1);
  expect(calls.filter(x => x.endsWith("/verify"))).toHaveLength(1);
});
test("portable auth rejects changed signing key/audience and never verifies the hostile challenge", async () => {
  for (const mutate of [(p: IdentityProof) => ({ ...p, audience: "https://evil.example" }), (p: IdentityProof) => ({ ...p, key: ("0x"+"2".repeat(40)) as `0x${string}` })]) {
    const { calls, impl } = fixture(mutate);
    const client = createGatewayClient({ portableIdentity, fetchImpl: impl });
    await expect(client.getAccount()).rejects.toThrow("Portable agent authentication failed");
    expect(calls).toEqual(["/identity/challenge"]);
  }
  expect(() => createGatewayClient({ portableIdentity, baseUrl: "https://evil.example" })).toThrow("trusted Wayleave");
});
test("portable auth never retries payment writes after 401", async () => {
  const { impl, calls } = fixture();
  const client = createGatewayClient({ portableIdentity, fetchImpl: (async (url, init) => {
    if (String(url).includes("/agent/operations")) { calls.push("write"); return new Response(null, { status: 401 }); }
    return impl(url, init);
  }) as typeof fetch });
  const intent = { chainId:11155111, account:"0x"+"2".repeat(40), fundingOwner:"0x"+"3".repeat(40), token:"0x"+"4".repeat(40), recipient:"0x"+"5".repeat(40), amount:"1", businessReference:"test", idempotencyKey:"test-1234", expiresAt:Math.floor(Date.now()/1000)+3600 };
  await expect(client.proposePayment(intent)).rejects.toThrow("401");
  expect(calls.filter(x => x === "write")).toHaveLength(1);
});
