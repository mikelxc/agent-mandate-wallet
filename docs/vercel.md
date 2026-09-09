# Vercel frontend deployment

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

Vercel hosts the frontend and its gateway-unavailable response. The current
gateway is a separate Bun service with a persistent SQLite operation ledger.
It cannot be deployed unchanged as an ephemeral Vercel function.

Without `MANDATE_GATEWAY_ORIGIN`, `/gateway/*` returns HTTP 503 with a readable
JSON error. The frontend can be built without gateway credentials. Agent access,
approvals, and passkey onboarding require a working hosted gateway; a frontend
build or deployment is not evidence that those services are live.

After a gateway is hosted, set `MANDATE_GATEWAY_ORIGIN` in the Vercel project's
environment to its HTTPS origin, without a trailing slash, and rebuild. Next.js
forwards `/gateway/*` to that service, preserving the frontend's same-origin
request paths. This is a build-time setting, not a `NEXT_PUBLIC_*` value.

The gateway host must separately provide a durable database, HTTPS routing,
and explicit `dashboardOrigin` and `gatewayOrigin` values to `createApp`.
Its current local launcher binds to loopback and uses local defaults; it still
needs hosted configuration. Preserve its exact origin validation and secure
cookie behavior. Passkeys are bound to their relying-party hostname, so choose
a stable dashboard domain before enrolling hosted credentials. Arbitrary preview
domains will not automatically work with an origin-restricted gateway.

Register the eventual dashboard domain in the Reown project's allowed origins
as required. The existing Reown project ID is public; relayer keys, database
contents, and test keystores must remain on the gateway host. The root
`.vercelignore` excludes local environment files, `.secrets`, and `.local` from
CLI source uploads. The developer signing endpoint exists only in the opt-in
local `dev-server.ts` launcher used by `bun run dev:e2e`, with its previous
Sepolia transaction allowlist and signing limits preserved. The launcher and
signer are excluded from CLI uploads and are not imported by any Next.js route.
They refuse production mode and Vercel environments. Ordinary `bun run dev`
uses the standard Next.js CLI with no signer. Both local development commands
forward `/gateway/*` to the separate gateway at `http://127.0.0.1:3001`.

## Verification — September 9, 2026

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
