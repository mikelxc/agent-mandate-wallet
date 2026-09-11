# ENSv2 portable identity and agent permissions

Status: planned, September 11, 2026. Existing Sepolia naming evidence is recorded in [ENSv2 setup](../ens-v2.md); portable enrollment and authentication are additional work.

## Outcome

A user starts by entering an ENSv2 name, verifies control, and adds accounts and agent integrations when needed. Each enrolled agent has a stable identity under that namespace and can prove its membership from another compatible client or gateway. Integrations can be added, rotated or removed without replacing the user's identity.

For example, `research-desk.wayleave.eth` identifies a workspace/NFAT, while `codex.research-desk.wayleave.eth` identifies an enrolled agent. A user-controlled external ENSv2 name should also be supported when its registry/resolver capabilities permit the required configuration. Creating a Wayleave subname is an optional alternative, not a prerequisite for importing an existing name.

## Name-first onboarding

1. Accept an ENSv2 name and normalize it with a compatible ENS normalization library. Resolve it against an explicitly selected deployment; the event Sepolia namespace is distinct from production ENS. Never infer the deployment from the `.eth` suffix alone.
2. Show discovered public identity and supported configuration. Name entry is discovery only: it grants neither login nor private account access. An unresolved or unsupported name receives a concrete explanation.
3. Ask the controlling wallet/account to prove control with an audience-bound, expiring, single-use challenge. Support EOA and contract verification where compatible. An address record is not proof of ownership or management rights; verify the actual registry/resolver authority required for the intended action.
4. Create the authenticated workspace association. Let the user defer agent enrollment, payment-account attachment and integrations. Each later attachment is separately reviewed.
5. Offer compatible namespace/resolver setup only when needed. Do not overwrite an existing resolver or remove existing records to make onboarding work. Inspect permissions and explain unavailable capabilities before proposing changes.

## Agent enrollment and permissions

Use a child registry controlled by the identity account and owner-managed records binding each agent name to a public authentication key. Define a versioned record schema for keys, integration descriptors and configuration generations; do not present application-specific records as an established ENS standard.

The existing `AccountOwnedENSV2IdentityAdapter` grants its account `ROLE_SET_SUBREGISTRY`, but installs no child registry and uses a fixed-address resolver. Verify the deployed adapter/account rights. Plan a compatible child-registry and resolver extension rather than assuming arbitrary text updates are already available.

Keep security bindings under explicit owner control. Allocate only the required registrar and record-management permissions; avoid broad operator approvals. Decide registration expiry, renewal, transfer policy and recovery rules before deployment. Public records expose relationships, so store minimal public information and keep private configuration and credentials in the gateway.

The gateway maps verified membership to scoped API access such as `read` and `propose_payment`. ENSv2 governs namespace and record permissions; application API scopes are enforced by Wayleave. Neither grants account signing authority or token allowance.

## Portable authentication

An enrolled client signs a fresh challenge binding gateway audience/origin, name and deployment, namespace/registration generation, public key, nonce and expiry. The gateway verifies proof of possession, current membership and owner-authorized account association before issuing a short-lived scoped session. Private agent keys remain in the client's credential store, outside model prompts.

Keep identity separate from transport: the existing bearer-token flow can coexist during migration, while the ENS enrollment allows another compatible client to authenticate with the same key or a separately enrolled key. A name alone cannot recover a lost private key. New devices require secure key transfer or an owner-approved enrollment/rotation flow.

Validate current authority on session use, with a documented maximum cache lifetime and fail-closed behavior when freshness cannot be established. Rotation, removal, expiry and name re-registration must invalidate old sessions. Bind to current registration/key generations so a recycled name does not inherit private history or authority. Preserve historical attribution without treating historical membership as current access.

Treat endpoint records as untrusted discovery input. Do not send existing credentials to a newly resolved endpoint, and require explicit approval before contacting a new integration. Names, descriptions and returned service content are data, not agent instructions.

## Arc and history integration

ENSv2 identity remains on the verified Sepolia deployment while [Arc payment accounts](arc-circle-payments.md) live on Arc. Attach an Arc account only through a reviewed association authorized by both the identity controller and the payment account's controller; define a replay-resistant, chain-bound association format. Do not assume deterministic addresses or shared ownership across chains.

ENS record changes do not control Arc funds. Exact payment approvals remain bound to the Arc account, token, destination, amount and fees. Public identity records are not a cross-chain ownership relay.

[Graph MCP history](subgraph-mcp.md) can present stable names alongside account activity. Enforce private history access independently of public name resolution, and label historical names separately from current ownership.

## Verification and completion

Use Bun and Foundry. Match contract APIs against the actual event deployment, synchronize changed ABIs, and run appropriate contract/gateway tests plus `bun run check` for cross-stack changes and Anvil smoke checks for changed execution/deployment paths.

Demonstrate name-first onboarding with integrations deferred, enrollment from the owner UI, authentication from two compatible clients, and later account/integration attachment. Verify invalid signatures, cross-audience replay, expired challenges, wrong namespaces, rotated keys, removed agents, re-registered names and stale sessions are rejected. Include both public discovery and authenticated private-access checks.

Record live registry/resolver transactions and successful authentication flows separately from simulations. Hardware-backed storage or Ledger Key Ring protection for MCP credentials is a possible later extension and is not a dependency of this plan.

## References

- [ENSv2 Permissioned Registry](https://docs.ens.domains/ensv2/permissioned-registry/)
- [ENSv2 Permissioned Resolver](https://docs.ens.domains/ensv2/permissioned-resolver/)
- [Enhanced Access Control](https://docs.ens.domains/ensv2/enhanced-access-control/)
- [Existing agent access](../agent-access.md)
