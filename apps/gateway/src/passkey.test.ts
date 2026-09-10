import { describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { encodeAbiParameters, bytesToHex, type Hex } from "viem";
import { Store } from "./store";
import { createApp, verifyPasskeyAssertion } from "./app";
import type { Chain } from "./chain";

const origin = "http://localhost:3000";
const account = "0x1111111111111111111111111111111111111111" as const;

function assertion() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const point = der.subarray(der.length - 65);
  const key = { x: BigInt(`0x${point.subarray(1, 33).toString("hex")}`), y: BigInt(`0x${point.subarray(33).toString("hex")}`) };
  const challenge = Buffer.from("test-challenge").toString("base64url");
  const client = `{"type":"webauthn.get","challenge":"${challenge}","origin":"${origin}"}`;
  const auth = Buffer.concat([createHash("sha256").update("localhost").digest(), Buffer.from([5, 0, 0, 0, 0])]);
  const sig = sign("sha256", Buffer.concat([auth, createHash("sha256").update(client).digest()]), privateKey);
  let i = 2;
  const read = () => { const n = sig[i + 1]!; const out = BigInt(`0x${sig.subarray(i + 2, i + 2 + n).toString("hex")}`); i += 2 + n; return out; };
  const r = read(); const s = read();
  const proof = encodeAbiParameters([{ type: "bytes" }, { type: "string" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bool" }], [bytesToHex(auth), client, 1n, r, s, false]);
  return { key, challenge, proof };
}

test("verifies a real software P-256 WebAuthn assertion and rejects origin changes", () => {
  const a = assertion();
  expect(verifyPasskeyAssertion({ x: a.key.x.toString(), y: a.key.y.toString() }, a.challenge, a.proof, origin)).toBe(true);
  expect(verifyPasskeyAssertion({ x: a.key.x.toString(), y: a.key.y.toString() }, a.challenge, a.proof, "https://evil.example")).toBe(false);
});

test("passkey availability and registration challenge routes are public and bounded", async () => {
  const store = new Store(":memory:");
  const chain = {
    ownership: async () => ({ owner: account, tokenId: "1", epoch: "1" }),
    verifyLogin: async () => false, balances: async () => ({}), prepare: async () => ({} as any), verifyApproval: async () => false, receipt: async () => ({} as any),
    passkey: { factory: "0x2222222222222222222222222222222222222222", labelAvailable: async () => true, accountAddress: async () => account, registrationDigest: async () => "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex, relay: async () => ({ transactionHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex, account, tokenId: "1" }) },
  } as Chain;
  const app = createApp(store, chain, { dashboardOrigin: origin, now: () => 1000 });
  const call = (path: string, body: unknown) => app(new Request(`http://127.0.0.1:3001${path}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  expect((await call("/passkey/availability", { label: "alice" })).status).toBe(200);
  const response = await call("/passkey/registration/challenge", { label: "alice", credentialId: "credential-1", key: { x: "1", y: "2" } });
  expect(response.status).toBe(200);
  const data = await response.json() as any;
  expect(data.account).toBe(account);
  expect((await call("/passkey/registration/challenge", { label: "bad label", credentialId: "credential-1", key: { x: "1", y: "2" } })).status).toBe(400);
  store.close();
});
