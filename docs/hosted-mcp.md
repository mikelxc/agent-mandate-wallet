# Connect an agent with a bearer token

Local and hosted MCP use the same owner-issued bearer token. There is no agent
private key, child-registry enrollment, external session helper, or automatic
renewal flow. The token grants API access; it never signs payments.

1. In Wayleave, verify your ENS identity with your wallet and link your Arc account.
2. Open **Connect agent**. Enter a connection label and select the associated account.
3. Choose read-only access or reading plus payment proposals, and a session length:
   **15 minutes, 1 hour, 24 hours (default), 7 days, or 30 days**.
4. Select **Sign and create bearer token**. Review the exact identity, account,
   permissions, and expiry in your wallet. Signatures do not incur a network fee.
5. Copy the private MCP settings while the new token is visible. Enter secrets only
   in your MCP client's private settings. The token cannot be retrieved later.
6. Reload the client and call `get_account`. Verify identity, account, chain,
   permissions, and expiry. Do not propose a payment merely to test setup.

To ask an agent for help, choose its client and connection method, expand
**Ask an agent to help you set up**, and paste **Copy setup prompt** into that
agent's conversation. The prompt omits the token and provides manual instructions
if the agent cannot edit its client settings.

## Hosted HTTP

The web application serves stateless Streamable HTTP at `/mcp`. After deployment,
use `https://www.wayleave.xyz/mcp` and a private header:

```text
Authorization: Bearer <WAYLEAVE_AGENT_TOKEN>
```

The token already binds the account; no account-selection header is needed.
The chat client does not need Bun, Node.js or a terminal. It must support a custom
bearer header; OAuth-only connectors are not supported.

The existing hosted gateway requires its Turso configuration. Preview origins must
be explicitly included in `MANDATE_DASHBOARD_ORIGINS`. This revision has local
verification only and does not establish a production deployment.

## Local package

Set `WAYLEAVE_AGENT_TOKEN` and `WAYLEAVE_GATEWAY_URL` privately in the MCP process
environment. The setup screen offers npx and bunx launchers for `wayleave-mcp@0.1.3`.
Use Node.js 20+ with npx, or Bun with bunx. No checkout, build or signing key is
required. The 0.1.3 release adds the purchase tools and bearer-only authentication;
publish that release before deploying the updated setup page.

## Expiry and revocation

A session starts at the time shown in the authorization request. Its expiry is
signed and cannot be extended after issuance. The server accepts integer durations
from 900 to 2,592,000 seconds and caps expiry at the ENS name's expiry. Owner browser
sessions remain short-lived and are separate from the selected agent session.

Create a new token after expiry. Revoke individual connections under **Your
connections**. Tokens are shown only at creation; list responses never return
credentials. The server stores only a SHA-256 token hash. Each request checks
revocation, signed scope, chain/account binding, current ENS registration and
controller, and the payment account controller and ownership epoch. Changing any
of those authority bindings invalidates the grant. Revocation prevents new calls;
it does not cancel a request already authorized or an owner-approved transaction.

The owner signs an exact, single-use five-minute challenge. Account association is
checked before issuance and on every use. No agent can mint or renew its own token.
Wallet payment review and signing remain separate from token authorization.

Codex uses `url` and `http_headers` for hosted MCP:
[official configuration documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
