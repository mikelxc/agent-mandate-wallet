# Vercel frontend and gateway deployment

The repository is linked locally to `tapants/agent-mandate-wallet-web`.
Vercel's project root is `apps/web`; run CLI commands from the repository root.
The local link and downloaded environment files are ignored by Git.

## Build and release

`apps/web/vercel.json` selects Next.js and explicitly runs installation and
the build with Bun 1.4.1 through `bunx bun@1.4.1`. Vercel's default Bun 1.3.14
cannot read this repository's version-2 lockfile; the `packageManager` field
alone does not select the hosted Bun binary. The install keeps the lockfile
frozen, following [Vercel's version-pinning guidance](https://vercel.com/kb/guide/how-to-pin-a-specific-bun-version-for-vercel-builds).
Next.js is the single frontend build and development
system, running under Bun as described in
[Bun's Next.js guide](https://bun.com/guides/ecosystem/nextjs). It uses the standard
`.next` output and `tsconfig.json`; the old Vinext/Vite/Cloudflare tooling has
been removed. Vercel's deployed functions use Node.js 24. The Vercel build uses committed SDK ABIs
and does not require Foundry or deploy contracts. After contract changes, run
`bun run abi` and include the generated ABI changes before releasing the frontend.

```sh
bun install --frozen-lockfile
bun run build:web                    # frontend-only Next.js production build
bunx vercel build --yes              # Vercel preview deployment output
```

To link another checkout to the same existing project:

```sh
bunx vercel link --yes --project agent-mandate-wallet-web --scope tapants
```

When ready to publish a preview, run `bunx vercel deploy --prebuilt` after the
Vercel build. For production, build with `bunx vercel build --prod --yes`, then
publish with `bunx vercel deploy --prebuilt --prod`. A preview build must not be
used as production output. Building alone does not publish or change production.

The project dashboard may still display the original Vite preset; the committed
`vercel.json` overrides it for these builds. Keep the root directory at `apps/web`
and enable access to files outside that directory for workspace dependencies.

## Gateway boundary

The Next.js `/gateway/[...path]` route runs the gateway in the same Vercel project.
It uses asynchronous libSQL queries and transactions against a persistent Turso
database, not an instance-local file or an in-memory production database. Local
development still uses a SQLite file through the same client and store.

Provision the **Starter ($0/month)** Turso database through Vercel Storage, in
`iad1`, and connect it to this project's **production** environment. Vercel requires
the account owner to accept marketplace terms first. From the repository root:

```sh
bunx vercel integration add tursocloud/database --plan starter \
  --name wayleave-gateway --metadata region=iad1 \
  --environment production --no-env-pull --scope tapants
```

The integration supplies server-only `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
Also set `MANDATE_DASHBOARD_ORIGINS` to
`https://way-leave.vercel.app,https://agent-mandate-wallet-web.vercel.app`.
Leave `MANDATE_GATEWAY_ORIGIN` unset to use the in-project gateway. That optional
build-time setting still supports forwarding to an external HTTPS gateway.
Never use `NEXT_PUBLIC_*` names for database credentials or signing keys.

Missing database/origin configuration returns JSON 503; unknown hosts and foreign
write origins are rejected. Preview domains are not automatically trusted and
must not share production database credentials. Schema initialization only creates
missing tables/indexes; it does not erase local or hosted data. Nonce consumption,
payment state changes, and rate limits are shared across function instances.

Reown's SIWE integration verifies the signed message on the gateway before creating
a Secure, HttpOnly, SameSite=Strict session cookie. Challenges bind the exact site,
Sepolia chain, bounded issuance time, exact server expiration, and a one-use nonce. Supported native
WalletConnect wallets can combine connection and authentication; injected wallets
use Reown's sign-in view. Authentication grants no spending authority.

Agent setup snippets now include the deployed `/gateway` URL. The MCP client
accepts only local HTTP or the two named Wayleave HTTPS gateway URLs, refuses
credentials/query strings in the URL, and does not follow bearer-token redirects.

Passkey onboarding remains disabled without the separately configured factory and
relayer. This deployment is not evidence that the passkey, ENS, Arc or Ledger
integrations are live. Passkeys are hostname-bound; choose a stable domain before
enrolling hosted credentials.

Register the eventual dashboard domain in the Reown project's allowed origins
as required. The existing Reown project ID is public; relayer keys, database
contents, and test keystores must remain server-side. The root
`.vercelignore` excludes local environment files, `.secrets`, and `.local` from
CLI source uploads. The developer signing endpoint exists only in the opt-in
local `dev-server.ts` launcher used by `bun run dev:e2e`, with its previous
Sepolia transaction allowlist and signing limits preserved. The launcher and
signer are excluded from CLI uploads and are not imported by any Next.js route.
They refuse production mode and Vercel environments. Ordinary `bun run dev`
uses the standard Next.js CLI with no signer. Both local development commands
forward `/gateway/*` to the separate gateway at `http://127.0.0.1:3001` when no
Turso configuration is present.

## Earlier frontend verification — September 9, 2026

- `bunx vercel build --yes` produced `.vercel/output` for the preview target,
  using Next.js 16.3.4 and Bun 1.4.1. No deployment was published.
- `bun run check` passed the Next.js build, workspace type checks, Bun tests
  (including the test-signer isolation checks), and 44 Foundry tests.
- `bun run smoke` passed on local Anvil (31337), including payment, replay
  rejection, and ownership-handover invalidation. This is local-chain evidence.
- The built Next.js server returned 200 for `/`, `/accounts`, and `/advanced`,
  JSON 503 for gateway requests without configuration, and 404 for POST requests
  to the developer signer endpoint. Browser wallet and hosted gateway flows
  have not been verified on Vercel.
- The local Next.js E2E launcher returned 200 for all three pages and the
  gateway health check, returned the Sepolia chain ID through its read-only
  test-wallet endpoint, and rejected a foreign origin with HTTP 400. No
  public-chain transaction or signature was requested during this check.

## Gateway migration verification — September 9, 2026

- The production Next.js build includes the dynamic gateway route.
- `bun run check` passed build, type checks, 59 Bun tests and 44 Foundry tests;
  additional shared-storage and hosted MCP allowlist tests also passed afterward.
- Nine browser checks passed against the local production build, including successful
  verification and rejection of a wrong-wallet signature. Ownership testing
  used the real gateway handler and a disposable software wallet; gateway requests
  were intercepted locally. No production wallet or public-chain transaction was used.
- `bun run smoke:gateway` passed local HTTP/MCP authentication, idempotency, approval,
  redaction and revocation with a simulated chain. `bun run smoke` passed on Anvil.
- At this stage, live gateway deployment was pending Turso marketplace terms acceptance
  and database provisioning. These local checks alone did not prove hosted verification.
- `MANDATE_DASHBOARD_ORIGINS` is configured in Vercel production for both named aliases.
  No production deployment or database had yet been created at the local-test stage.

## Production release — September 9, 2026

- Provisioned `wayleave-gateway` on Turso's Starter plan through Vercel, region
  `iad1`, and connected it to this project's production environment only.
- Published the frontend and gateway together as Vercel deployment
  `dpl_838BaERNta1vwgQ8xypt3K73H16P` (Ready), built with Bun 1.4.1 and Next.js 16.3.4.
- Canonical site: https://way-leave.vercel.app. Deployment inspection:
  https://vercel.com/tapants/agent-mandate-wallet-web/838BaERNta1vwgQ8xypt3K73H16P.
- Live `/gateway/health` returned HTTP 200 with `ok: true`, chain `11155111`,
  `human_approval` mode, and `Cache-Control: no-store`. The function ran in `iad1`.
- Passkey factory/relayer credentials were not configured. No contract deployment,
  user-wallet signature, token approval or public-chain transaction was performed.
- An independent verification subagent tested the live canonical URL, without gateway
  mocks: homepage/health 200; a random disposable EOA signed a real SIWE challenge;
  verification succeeded and the Secure/HttpOnly session matched across three subsequent
  requests. Wrong-wallet signatures and replay returned 401, foreign Origin returned 403,
  logout returned 200 and invalidated the prior cookie (401). The developer signer returned 404.
- Headless Chrome also completed Reown connection/signing against the real production
  endpoints with one disposable login signature and displayed "Owner verified". No page
  crash or `file:///` warning was observed. Anonymous-session 401 responses and nonblocking
  Coinbase analytics DNS failures appeared in the console. No real user wallet was used.
- The former `agent-mandate-wallet-web.vercel.app` alias is no longer attached and returns
  404; use `way-leave.vercel.app`. No legacy alias was reassigned during this release.

## Native WalletConnect authentication fix — September 9, 2026

- Reproduced an approved native `session_authenticate` request through the real
  WalletConnect relay against production. SignClient 2.23.7 generates a fresh `iat`
  with milliseconds, ignoring the server's supplied issuance timestamp. The old
  gateway's exact timestamp comparison rejected the valid signature with HTTP 401.
- Issuance time is now bounded by the challenge lifetime and 60 seconds of clock
  skew. The server's five-minute expiration, exact origin/chain, signature checks,
  and atomic one-use nonce remain enforced. Regression coverage includes fresh
  timestamps, stale/future timestamps, expiration, wrong signatures and replay.
- Native authentication can complete before wagmi publishes its connected address.
  The UI now restores both verified state and success text from the authenticated
  session when that account arrives, and normalizes session addresses.
- Published final production deployment `dpl_CmK2ekTCYeoH4auUi6ViwYNsEXhC` (Ready):
  https://vercel.com/tapants/agent-mandate-wallet-web/CmK2ekTCYeoH4auUi6ViwYNsEXhC.
- Repeated the live relay test with a disposable software wallet: exactly one login
  signature, `/auth/siwe/verify` 200, matching `/auth/session` 200, visible
  "Owner verified", and logout 200. No gateway interception or injected provider
  was used for this native test. The verifier refused subsequent signing and
  transaction requests; no funds or user keys were used. This verifies the native
  protocol path, not Trust Wallet's own application/browser implementation.
- The existing live injected-wallet check also passed, along with live wrong-signature,
  replay, foreign-origin and logout checks. Type checks and the repository test suite
  passed; the additional challenge-lifetime boundary regression passed afterward.
- The reported `MutationEvent` exception was not reproduced and its source remains
  unidentified. Anonymous-session 401 is expected before authentication. Font preload
  and Coinbase analytics warnings are not evidence of rejected wallet approval.
- Deployed-frontend browser regressions: 8/9 passed, including both ownership cases
  and mobile/desktop WalletConnect pickers. The unrelated onboarding walkthrough
  expects the agent chooser at step 2, but the deployed step 2 is now the authority
  screen; that test needs reconciliation with the separate onboarding changes.

## iPhone wallet launch and signing changes — September 10, 2026 (local)

- Prefer wallet-provided universal links through Reown's
  `experimental_preferUniversalLinks` option. Reown retains the native deep-link
  fallback when the wallet does not provide a universal link.
- Fetch the SIWE challenge before opening the connection picker. Reuse its nonce
  and message parameters for signing instead of starting another gateway fetch
  during the Sign tap. Refresh near-expiry challenges and clear them after
  verification or logout; gateway expiration and replay checks remain unchanged.
- For an already connected owner, prepare the challenge and then open Reown's
  SIWX sign-message view so the owner has a fresh Sign tap after network switching.
  The controller dependency is pinned to the installed AppKit version (1.8.23).
- Validation: frontend TypeScript checks, 21 focused unit/gateway tests, and four
  Chrome browser tests covering valid/invalid signatures and mobile/desktop picker
  layouts passed. The signing tests assert that no second nonce request occurs
  between selecting a wallet and signing.
- These changes have not been deployed or verified with a physical iPhone wallet.
  Browser automation does not establish successful iOS app handoff. A challenge
  that expires while the picker remains open can still require a network refresh.

## Payment review funding errors — September 10, 2026

- Read-only diagnosis of the reported production operation found 100 demo USDC
  in the funding wallet, zero account allowance, and zero EntryPoint gas deposit.
  The preparation failure was reproduced against live Sepolia without signing or
  changing production records. The separate `file:///` warning was not identified.
- Gateway funding checks now report missing balance, capped allowance and gas
  deposit together, with required amounts. Deliberately authored errors have
  stable codes; unexpected provider errors remain redacted. Approval still checks
  funding and simulates the signed operation before accepting it.
- Review displays progress and errors on the payment card, clears stale quotes,
  and links to expanded funding settings with the account ID prefilled from the
  deployed validator. No automatic allowance, deposit, or payment is performed.
- Released isolated HEAD plus these payment changes as production deployment
  `dpl_8cUQCGDxa49QuRgHEuArCWeZqNYd`, Ready and aliased to
  https://way-leave.vercel.app. Existing uncommitted wallet-login changes were
  excluded. Vercel's production build and TypeScript validation passed.
- Validation: 42 gateway tests, workspace type checks, local Anvil payment/replay/
  ownership-handover smoke test, live gateway health 200, and browser confirmation
  that the reported account resolves to prefilled account ID 2 in funding settings.
  The local Next.js build encountered a sandbox port-binding failure; the hosted
  build passed. The owner's authenticated review and funded payment still require
  their wallet; no production payment was submitted during verification.

## Inline payment setup — September 11, 2026

- Released `dpl_EfYnthmn81VyHVSGpFpTCVcGbVJm` (Ready) to
  https://way-leave.vercel.app from the isolated payment release source.
- Review now opens an inline funding check and walkthrough. Missing demo tokens,
  exact-amount allowance and gas shortfall are separate, explicit wallet steps;
  confirmed funding proceeds to exact-payment preparation. Already funded requests
  proceed directly to review. Setup transaction links and pending-receipt recovery
  are distinct from payment evidence. Existing unrelated login edits were excluded.
- Single-transaction setup plus payment is not supported by this deployed token /
  EntryPoint submission path; see the threat-boundary discussion in docs/kernel.md.
- Verified 46 focused funding/gateway tests, workspace type checks, local Anvil
  payment/replay/handover smoke, hosted production build and gateway health. No
  user-wallet setup transaction or payment was submitted during verification.
- An initial release was started from the workspace instead of the isolated source;
  deployment `dpl_8HMG7i8iXMuHXYzxSV38rnGDLm9K` was cancelled before alias assignment.
