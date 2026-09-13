# ENSv2 portable identity

The identity gateway uses the ETHOnline ENSv2 deployment on Sepolia explicitly. It does not treat production `.eth` names as registrations on that deployment. Visit `/identity` to discover a name, prove control, and create a workspace before adding accounts or agents.

## Authority and authentication

Discovery walks the registry hierarchy from the configured ETHRegistry, reading each ancestor's current owner, registration resource, token version, expiry, resolver and child registry at one block. An address record is never used as evidence of ownership. The RPC must report Sepolia and a block timestamp no more than 120 seconds old. Unsupported registry APIs and failed reads deny authentication.

Owner challenges are bound to the gateway audience, deployment, normalized name, registration fingerprint, controlling address, nonce and expiry. EOA and compatible ERC-1271 signatures are verified through viem. Owner sessions use an HttpOnly, SameSite=Strict cookie. A connected EOA cannot substitute for a smart account's signature merely because it owns that account's NFAT; the wallet must produce the compatible contract-signature format.

### Adapter-held Wayleave names

Names created by the deployed Sepolia Wayleave factory are held by the immutable naming adapter, which has no ERC-1271 signing support. For this specific deployment, the gateway recognizes the current NFAT owner as the named workspace's authentication controller. This is gateway authorization backed by onchain NFT ownership, not ENS registry ownership or permission to modify ENS. Discovery exposes the actual registry owner and the NFT authority separately; the UI identifies this distinction.

This exception applies only to direct `*.wayleave.eth` children in the pinned user registry whose registry owner and resolver are the pinned adapter. At the same fresh Sepolia block, the gateway checks both adapter/factory bindings, the adapter's ENS registry, the immutable name-to-account mapping, the pinned validator's account binding, and the factory's account, exact label, current NFT owner and ownership epoch. Arbitrary address records, other adapters, and other factories cannot opt in. The registration fingerprint includes this authority and epoch, so handover invalidates pending challenges, sessions and bearer tokens, including a transfer away and back. Agent access uses owner-issued tokens; the child-registry authentication path does not use this exception. Payment association still requires a separate proof from the current payment account owner on its own chain. No signing key, token approval or execution permission is added.

The browser switches to Sepolia before identity signing and rejects a connected wallet that differs from the discovered authentication controller. Arc association remains a separate Arc signature.

Agent access uses owner-issued bearer tokens. After verifying the ENS identity and
associating an account, choose a connection label, permissions and session length,
then sign the token authorization with the identity controller's wallet. No agent
private key or child-registry deployment/enrollment is required by the MCP flow.
A connection label is gateway metadata under the ENS identity, not evidence of an
onchain child-name registration.

The signed grant includes the gateway audience, identity registration/controller,
account chain/address/controller/epoch, connection label, scopes, requested duration,
absolute token expiry and a single-use challenge nonce. Challenges last five minutes.
Agent sessions last 15 minutes to 30 days, capped at ENS expiry. The server stores
only the token hash, checks authority on every use and supports per-token revocation.
The owner login remains a separate, at-most-15-minute HttpOnly browser session.

[Local and hosted setup instructions](hosted-mcp.md) describe creating and replacing
tokens. The child-registry contracts remain separate research artifacts; the current
MCP connection UI does not deploy or require them.

## Payment account association

### Identity chain and payment chain

The hackathon identity registry and permissions remain on Sepolia (`11155111`); an attached payment account can live on Arc Testnet (`5042002`). The gateway reads each chain independently. Arc contracts do not call or mirror the Sepolia ENS registry, and no bridge is required for this application-level association. Arc execution still requires the current Arc NFAT owner's signature.

Public account discovery can additionally use [ENSIP-11](https://docs.ens.domains/ensip/11/) chain-specific address records: `coinType = 0x80000000 | chainId`, giving `2152525650` for Arc Testnet. Resolution uses the dedicated hackathon Sepolia resolver, explicitly requesting that coin type. This record is a proposed discovery enhancement, not currently written by the association flow. The selected resolver must support multicoin address writes; the custom agent registry currently exposes authentication-key addresses, not payment-account records. Do not replace the default Sepolia address or treat a resolved Arc address as authorization.

The identity session does not become a payment-owner session. Attaching an account requires a fresh, single-use message binding audience, ENS deployment, identity registration and controller, payment chain and account, payment controller and ownership epoch. The identity controller authorizes the request via the authenticated owner session; the actual payment controller signs the association message. The gateway independently checks payment ownership on that explicitly configured chain.

Bearer access checks the current ENS identity registration/controller and the attached
payment account's controller/epoch on every request. Each token binds one exact
chain and account; caller-supplied account headers cannot expand it. Private operations
remain scoped to that individual connection. Neither the token signature nor the
association message authorizes funds to move.

## Verification status

Implemented code has local Foundry coverage for unauthorized enrollment/removal, scope/expiry bounds, key rotation, parent transfer and re-registration. Gateway tests cover persistence, single-use/concurrent proofs, wrong keys/audiences, challenge expiry, session invalidation, upstream failure, distinct payment-controller authorization and chain isolation. These tests use local fixtures and are not deployment evidence.

Existing naming transactions in `ens-v2.md` prove naming only. A live completion
demonstration still requires a compatible controller wallet, reviewed account
attachment, a signed token grant, and successful authenticated calls from local and
hosted clients. Record those results separately from local test fixtures.
