# ENSv2 portable identity

The identity gateway uses the ETHOnline ENSv2 deployment on Sepolia explicitly. It does not treat production `.eth` names as registrations on that deployment. Visit `/identity` to discover a name, prove control, and create a workspace before adding accounts or agents.

## Authority and authentication

Discovery walks the registry hierarchy from the configured ETHRegistry, reading each ancestor's current owner, registration resource, token version, expiry, resolver and child registry at one block. An address record is never used as evidence of ownership. The RPC must report Sepolia and a block timestamp no more than 120 seconds old. Unsupported registry APIs and failed reads deny authentication.

Owner challenges are bound to the gateway audience, deployment, normalized name, registration fingerprint, controlling address, nonce and expiry. EOA and compatible ERC-1271 signatures are verified through viem. Owner sessions use an HttpOnly, SameSite=Strict cookie. A connected EOA cannot substitute for a smart account's signature merely because it owns that account's NFAT; the wallet must produce the compatible contract-signature format.

Agent challenges additionally bind the enrolled public key and key generation. Challenges expire after at most five minutes and are consumed atomically once. Sessions last at most fifteen minutes. Each session use re-reads registry authority and membership without a cache. Rotation, removal, expiry, ancestor changes, parent token-version changes and re-registration invalidate prior sessions. Database instances persist challenges and sessions in the gateway's existing SQLite/libSQL database.

The agent's private key belongs in its client's credential store. The model receives neither it nor the upstream gateway's credentials. `authenticatePortableAgent` in `@mandate/sdk` exchanges the challenge for a scoped bearer token against a deliberately configured gateway URL. It checks the returned audience/name/deployment, refuses redirects, and never follows ENS endpoint records.

## Agent registry

`WayleaveAgentRegistry` is a custom ENSv2 child registry, not a standard PermissionedResolver implementation or an ENS-wide record standard. Its version 1 records expose a public authentication address, expiry, generation and application scope bitmap:

- `1`: read account information/history after separately verified association.
- `2`: propose a payment for separate owner approval.

Only the current parent-name owner can enroll, rotate or remove a client. Agent keys receive no registration, resolver, operator, signing, execution or token-approval authority. Labels use lowercase ASCII letters/digits and internal hyphens; workspace names use ENS normalization. Enrollments cannot outlive the parent and preserve a generation counter through removal. Parent registration resources and token versions prevent old enrollments from surviving re-registration or permission/ownership changes. Recovery is a fresh owner-approved enrollment; a name cannot recover a private key.

The registry supplies child resolver discovery and address records for agent authentication addresses. It has no transfer or renewal API: renewal is owner re-enrollment with a new generation. Public records expose the agent-to-workspace relationship. Private integration settings stay in the gateway.

Existing account-owned names have no child registry installed. The UI preserves any existing registry/resolver. For a directly EOA-owned external name with `ROLE_SET_SUBREGISTRY`, the optional `DeployAgentRegistrySepolia.s.sol` script deploys and attaches an empty registry. It refuses non-Sepolia execution and overwriting an existing child registry. Set `ENS_PARENT_REGISTRY`, `ENS_IDENTITY_LABEL`, `ENS_IDENTITY_NAMEHASH` (the full normalized workspace namehash), and `ENS_IDENTITY_OWNER`, then use the existing Foundry keystore workflow. Review all values and simulate before broadcasting. A smart-account-owned name must execute attachment through that account; this script does not impersonate its owner.

Once a compatible registry is attached, `/identity` supports enrollment, rotation and removal transactions for a directly connected controlling EOA. The transaction must succeed before the UI reports enrollment. Contract-account owners need a wallet capable of issuing the same calls through their account.

## Payment account association

### Identity chain and payment chain

The hackathon identity registry and permissions remain on Sepolia (`11155111`); an attached payment account can live on Arc Testnet (`5042002`). The gateway reads each chain independently. Arc contracts do not call or mirror the Sepolia ENS registry, and no bridge is required for this application-level association. Arc execution still requires the current Arc NFAT owner's signature.

Public account discovery can additionally use [ENSIP-11](https://docs.ens.domains/ensip/11/) chain-specific address records: `coinType = 0x80000000 | chainId`, giving `2152525650` for Arc Testnet. Resolution uses the dedicated hackathon Sepolia resolver, explicitly requesting that coin type. This record is a proposed discovery enhancement, not currently written by the association flow. The selected resolver must support multicoin address writes; the custom agent registry currently exposes authentication-key addresses, not payment-account records. Do not replace the default Sepolia address or treat a resolved Arc address as authorization.

The identity session does not become a payment-owner session. Attaching an account requires a fresh, single-use message binding audience, ENS deployment, identity registration and controller, payment chain and account, payment controller and ownership epoch. The identity controller authorizes the request via the authenticated owner session; the actual payment controller signs the association message. The gateway independently checks payment ownership on that explicitly configured chain.

Portable agent access checks current identity membership and the attached payment account's current controller/epoch on every request. Connection IDs bind namespace registration, key and generation, chain, account and payment epoch. Private history never follows a recycled name or key automatically. Choosing a payment account is explicit when more than one is attached on a chain. Neither ENS permissions nor association messages authorize funds to move.

## Verification status

Implemented code has local Foundry coverage for unauthorized enrollment/removal, scope/expiry bounds, key rotation, parent transfer and re-registration. Gateway tests cover persistence, single-use/concurrent proofs, wrong keys/audiences, challenge expiry, session invalidation, upstream failure, distinct payment-controller authorization and chain isolation. These tests use local fixtures and are not deployment evidence.

The new child registry has not been deployed. Existing naming transactions in `ens-v2.md` prove naming only. A live completion demonstration still requires a compatible controller wallet, reviewed child-registry installation, real owner enrollment transactions, authentication from two clients, and reviewed account attachment. Record their transaction hashes and successful challenge/session flows separately from local test results.
