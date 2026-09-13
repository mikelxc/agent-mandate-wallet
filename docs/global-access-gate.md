# Global account access gate

Public UI routes are `/` (landing and `?setup`), `/payments` (including merchant information), and `/store/developer-pack`. A root URL containing `operation` is an approval page and is protected. Other UI pages require a connected owner wallet with a verified, matching gateway session.

The `/agents/new` page has been deleted. Proxy redirects legacy links permanently to `/connect`, preserving wallet query parameters before the access gate chooses a sign-in return destination.

Next's `proxy.ts` redirects requests without an opaque session-cookie candidate to `/?signin=1&returnTo=...`. Cookie presence is only a routing hint. The shared client gate checks the actual `/gateway/auth/session` response before mounting private UI and matches its address to the connected wallet. Forged, expired or mismatched sessions do not authorize UI access. Private API handlers retain their own authorization; the page gate does not replace it. Gateway, MCP, merchant protocol endpoints and static assets are excluded from page redirects.

After sign-in, only an internal, validated return destination is allowed. A wallet change or sign-out closes the gate. Focus and periodic session checks preserve in-progress UI while the existing session is valid and close it on expiry or verification failure. Network verification times out with retry guidance.

Validation covers public/private route policy, safe return paths, seven protected routes, forged cookies, public payments/merchant browsing, successful account access, preserved grant state on focus and session expiry. Browser tests use disposable wallets and intercepted gateway responses. No signing key, approval permission or public-chain execution was added.

Production release on September 13, 2026: Vercel deployment `dpl_HShcAoNwyANXd4C2RhfEw9Z6iiAe`, aliased to `https://www.wayleave.xyz`. Production build and TypeScript checks passed. The access-policy unit tests passed (2 tests, 20 assertions). All 10 browser tests in `access-gate.spec.ts` and `agent-access-flow.spec.ts` passed against the production URL, including return navigation after sign-in. Authenticated browser scenarios use intercepted gateway responses and do not claim verification with a user's live wallet.

Follow-up release: `dpl_DGbT7LqiK98EruS7aSnhfZc161W8` removes the legacy page, restores workspace wording omitted from the earlier isolated release, and includes gateway history authentication fix `ce7bf16`. Keep these frontend changes committed alongside gateway changes: Git-triggered production releases from older tracked UI can otherwise restore obsolete buttons and routes.
