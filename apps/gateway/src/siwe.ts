import { randomBytes, createHash } from "node:crypto";
import { isAddress, type Hex } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import type { Store } from "./store";
import type { Chain } from "./chain";
export const loginStatement = "Sign in to Wayleave. This grants no spending authority.";
const kind = "reown-siwe";
const challengeLifetimeSeconds = 300;
const clockSkewSeconds = 60;
export function createSiweAuth(store: Store, chain: Chain, origin: string, now: () => number) {
  const domain = new URL(origin).host;
  return {
    async nonce() {
      const nonce = randomBytes(32).toString("hex");
      const issuedAt = now();
      await store.createChallenge({
        id: nonce,
        address: "",
        message: `${kind}:${origin}`,
        expiresAt: issuedAt + challengeLifetimeSeconds,
      });
      return {
        nonce,
        domain,
        uri: origin,
        statement: loginStatement,
        issuedAt: new Date(issuedAt * 1000).toISOString(),
        expirationTime: new Date((issuedAt + challengeLifetimeSeconds) * 1000).toISOString(),
      };
    },
    async verify(message: string, signature: Hex) {
      const parsed = parseSiweMessage(message);
      const nonce = parsed.nonce;
      if (!nonce || !/^[a-f0-9]{64}$/.test(nonce)) throw new Error("Invalid sign-in nonce");
      const challenge = await store.getChallenge(nonce);
      if (
        !challenge ||
        challenge.message !== `${kind}:${origin}` ||
        challenge.usedAt !== null ||
        challenge.expiresAt <= now()
      )
        throw new Error("Sign-in challenge expired or used");
      if (
        !parsed.address ||
        !isAddress(parsed.address) ||
        parsed.chainId !== 11155111 ||
        parsed.version !== "1" ||
        parsed.uri !== origin ||
        (parsed.scheme && parsed.scheme !== new URL(origin).protocol.slice(0, -1)) ||
        !parsed.issuedAt ||
        Number.isNaN(parsed.issuedAt.getTime()) ||
        // WalletConnect authenticate creates its own millisecond-resolution iat.
        // Bound that timestamp instead of requiring the server's exact timestamp;
        // the server-owned nonce and expiration still determine proof lifetime.
        parsed.issuedAt.getTime() <
          (challenge.expiresAt - challengeLifetimeSeconds - clockSkewSeconds) * 1000 ||
        parsed.issuedAt.getTime() > (now() + clockSkewSeconds) * 1000 ||
        parsed.issuedAt.getTime() >= challenge.expiresAt * 1000 ||
        !parsed.expirationTime ||
        parsed.expirationTime.getTime() !== challenge.expiresAt * 1000 ||
        !validateSiweMessage({ message: parsed, domain, nonce, time: new Date(now() * 1000) })
      )
        throw new Error("Sign-in message does not match this site, network, or challenge");
      // WalletConnect may append its ReCap description to the login statement.
      // Authentication grants a session only; every payment still needs its own approval.
      if (
        parsed.statement !== loginStatement &&
        !parsed.statement?.startsWith(`${loginStatement} I further authorize`)
      )
        throw new Error("Unexpected sign-in statement");
      if (!(await chain.verifyLogin(parsed.address, message, signature)))
        throw new Error("Signature does not match wallet");
      // Consume after verification, atomically, so concurrent/replayed proofs fail.
      if (!(await store.consumeChallenge(nonce, now())))
        throw new Error("Sign-in challenge expired or used");
      const token = randomBytes(32).toString("hex");
      const address = parsed.address.toLowerCase();
      await store.createSession(
        createHash("sha256").update(token).digest("hex"),
        address,
        now() + 3600,
      );
      return {
        address,
        chainId: 11155111,
        cookie: `mandate_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${origin.startsWith("https:") ? "; Secure" : ""}`,
      };
    },
  };
}
