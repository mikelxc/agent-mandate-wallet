import { afterEach, expect, test } from "bun:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { verifyMessage, type Address } from "viem";
import { Store } from "./store";
import { createSiweAuth, loginStatement } from "./siwe";
import { createHostedGateway } from "./hosted";
import type { Chain } from "./chain";

const origin = "https://www.wayleave.xyz";
const owner = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const stores: Store[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
function fixture() {
  const store = new Store(":memory:");
  stores.push(store);
  let time = 1_780_000_000;
  const chain = {
    verifyLogin: (address, message, signature) =>
      verifyMessage({ address: address as Address, message, signature }),
  } as Chain;
  const auth = createSiweAuth(store, chain, origin, () => time);
  return {
    store,
    chain,
    auth,
    tick: (seconds: number) => {
      time += seconds;
    },
  };
}
function message(
  nonce: Awaited<ReturnType<ReturnType<typeof createSiweAuth>["nonce"]>>,
  overrides: Record<string, unknown> = {},
) {
  return createSiweMessage({
    address: owner.address,
    chainId: 11155111,
    domain: nonce.domain,
    uri: nonce.uri,
    version: "1",
    nonce: nonce.nonce,
    statement: nonce.statement,
    issuedAt: new Date(nonce.issuedAt),
    expirationTime: new Date(nonce.expirationTime),
    ...overrides,
  });
}

test("Reown verifies a real EOA signature, creates a secure session, and rejects replay", async () => {
  const f = fixture();
  const text = message(await f.auth.nonce());
  const proof = await owner.signMessage({ message: text });
  const verified = await f.auth.verify(text, proof);
  expect(verified.address).toBe(owner.address.toLowerCase());
  expect(verified.chainId).toBe(11155111);
  expect(verified.cookie).toContain("HttpOnly; SameSite=Strict");
  expect(verified.cookie).toContain("; Secure");
  await expect(f.auth.verify(text, proof)).rejects.toThrow("expired or used");
});

test("rejects wrong signatures without consuming the valid challenge", async () => {
  const f = fixture();
  const text = message(await f.auth.nonce());
  await expect(f.auth.verify(text, await other.signMessage({ message: text }))).rejects.toThrow(
    "Signature",
  );
  expect((await f.auth.verify(text, await owner.signMessage({ message: text }))).address).toBe(
    owner.address.toLowerCase(),
  );
});

test("accepts WalletConnect's fresh millisecond timestamp after the server issues the nonce", async () => {
  const f = fixture();
  const nonce = await f.auth.nonce();
  f.tick(4);
  const text = message(nonce, { issuedAt: new Date(1_780_000_003_427) });
  const signature = await owner.signMessage({ message: text });
  expect((await f.auth.verify(text, signature)).address).toBe(owner.address.toLowerCase());
  await expect(f.auth.verify(text, signature)).rejects.toThrow("expired or used");
});

test("a WalletConnect timestamp cannot extend the server-owned challenge lifetime", async () => {
  const f = fixture();
  const nonce = await f.auth.nonce();
  f.tick(290);
  const text = message(nonce, { issuedAt: new Date(nonce.expirationTime) });
  await expect(f.auth.verify(text, await owner.signMessage({ message: text }))).rejects.toThrow();
});

for (const [name, overrides] of Object.entries({
  domain: { domain: "attacker.example" },
  uri: { uri: "https://attacker.example" },
  chain: { chainId: 1 },
  statement: { statement: "Approve all payments" },
  staleIssuedAt: { issuedAt: new Date(1_779_999_939_000) },
  futureIssuedAt: { issuedAt: new Date(1_780_000_061_000) },
  expiration: { expirationTime: undefined },
})) {
  test(`rejects a valid signature with altered ${name}`, async () => {
    const f = fixture();
    const text = message(await f.auth.nonce(), overrides);
    await expect(f.auth.verify(text, await owner.signMessage({ message: text }))).rejects.toThrow();
  });
}

test("nonce is bound to its issuing origin, even between configured deployment origins", async () => {
  const f = fixture();
  const nonce = await f.auth.nonce();
  const alias = "https://agent-mandate-wallet-web.vercel.app";
  const text = message(nonce, { domain: new URL(alias).host, uri: alias });
  const auth = createSiweAuth(f.store, f.chain, alias, () => 1_780_000_000);
  await expect(auth.verify(text, await owner.signMessage({ message: text }))).rejects.toThrow();
});

test("rejects expiration during signature verification", async () => {
  const f = fixture();
  const text = message(await f.auth.nonce());
  f.chain.verifyLogin = async () => {
    f.tick(300);
    return true;
  };
  await expect(f.auth.verify(text, await owner.signMessage({ message: text }))).rejects.toThrow(
    "expired or used",
  );
});

test("concurrent verification consumes a nonce only once", async () => {
  const f = fixture();
  const text = message(await f.auth.nonce());
  const signature = await owner.signMessage({ message: text });
  const results = await Promise.allSettled([
    f.auth.verify(text, signature),
    f.auth.verify(text, signature),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
});

test("accepts the WalletConnect ReCap statement while retaining login-only session scope", async () => {
  const f = fixture();
  const text = message(await f.auth.nonce(), {
    statement: `${loginStatement} I further authorize the stated URI to perform the following actions on my behalf: (1) 'request': 'personal_sign' for 'eip155'.`,
  });
  expect((await f.auth.verify(text, await owner.signMessage({ message: text }))).chainId).toBe(
    11155111,
  );
});

test("hosted gateway handles health, enforces origins, and supports idempotent logout", async () => {
  const f = fixture();
  const hosted = createHostedGateway(f.store, f.chain, [origin]);
  const call = (path: string, init?: RequestInit) =>
    hosted(new Request(`${origin}/gateway${path}`, init));
  expect((await call("/health")).status).toBe(200);
  expect((await call("/auth/session")).status).toBe(401);
  expect((await call("/auth/siwe/nonce", { method: "POST", body: "{}" })).status).toBe(403);
  expect(
    (
      await call("/auth/siwe/nonce", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await hosted(
        new Request("https://evil.example/gateway/health", {
          headers: { "X-Forwarded-Host": new URL(origin).host },
        }),
      )
    ).status,
  ).toBe(403);
  const nonce = await (
    await call("/auth/siwe/nonce", { method: "POST", headers: { Origin: origin }, body: "{}" })
  ).json();
  const text = message(nonce);
  const signedIn = await call("/auth/siwe/verify", {
    method: "POST",
    headers: { Origin: origin },
    body: JSON.stringify({ message: text, signature: await owner.signMessage({ message: text }) }),
  });
  expect(signedIn.status).toBe(200);
  const cookie = signedIn.headers.get("Set-Cookie")!.split(";")[0];
  expect((await call("/auth/session", { headers: { Cookie: cookie } })).status).toBe(200);
  for (let i = 0; i < 2; i++)
    expect(
      (
        await call("/auth/logout", {
          method: "POST",
          headers: { Origin: origin, Cookie: cookie },
          body: "{}",
        })
      ).status,
    ).toBe(200);
  expect((await call("/auth/session", { headers: { Cookie: cookie } })).status).toBe(401);
});
