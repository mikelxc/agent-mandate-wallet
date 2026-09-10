# Passkey root accounts

`PasskeyAccountFactory` creates a Kernel v4 account for a user who has no existing
wallet. Its primary validator is ZeroDev's vendored WebAuthn validator. The
registry mints the account's identity NFT to the account itself. The NFT is
permanently non-transferable; its ownership is not consulted for signatures.
This avoids recursive ERC-1271 checks through a self-owned NFT.

## Deterministic identity

A key is the pair of P256 public coordinates `(x, y)`. The factory derives its
nonce from the key hash, chain ID and factory address. KernelFactory also commits
to the implementation and complete validator initialization package. Names,
sequential NFT IDs and relayer addresses do not affect the predicted address.
Call `accountAddress(key)` before deployment; do not interpret the public key as
an address or a globally portable CREATE2 salt.

The credential ID is browser discovery metadata, not an authority or another
address derivation input. The initializer uses a canonical zero credential hash
because the upstream validator ignores that field. Store the actual credential
ID and relying-party configuration in the client for subsequent assertions.

Anyone can relay a creation request. A WebAuthn assertion over
`registrationDigest(key, label, deadline)` is required before deployment. This
EIP-712 digest binds the chain, product factory, predicted account, public key,
label and expiry. It is the raw 32-byte WebAuthn challenge, not an Ethereum
personal-sign message. A copied request can only create the exact authorized
account and name. Key reuse within the same factory is rejected.

Kernel's upstream factory is permissionless, so accounts may already exist at
the predicted address. Registration checks the current root validator and its
installed public key. It does not certify that a previously deployed account has
no additional modules, approvals or transaction history. The passkey holder can
change Kernel configuration; the NFT is a stable identity, not an immutable
statement about the account's current security settings.

## Validator version and verification

The npm SDK `@zerodev/passkey-validator@5.6.0` maps its
`V0_0_3_PATCHED` enum to Kernel v3 releases, not our pinned Kernel v4. This project
therefore vendors a pinned upstream validator source with Kernel v4 interface
imports. It does not claim to deploy the published v3 enum address or an audited
Kernel v4 release. See the source/revision notes in
`packages/contracts/src/vendor/zerodev/README.md`.

Registration and UserOperations use the same assertion encoding:
`(bytes authenticatorData, string clientDataJSON, uint256 responseTypeLocation,
uint256 r, uint256 s, bool usePrecompiled)`. The upstream implementation expects
compact JSON with the challenge property at byte offset 23. Client integration
must preserve the signed JSON verbatim and reject unsupported layouts, not
rewrite JSON after signing. The P256 signature must use low-s normalization.

The validator requires user presence and verification, validates the challenge
and response type, and verifies the P256 signature. It does not enforce an
onchain relying-party ID or origin allowlist. Browser onboarding must configure
and check those values. A shared embedded-wallet relying-party domain is a
product decision: unrelated embedding domains cannot simply share a passkey.
The precompile at `0x100` or the upstream Daimo verifier must actually exist on
the target chain; an unavailable verifier cannot authorize a signature.

## ENS

Use a new `AccountOwnedENSV2IdentityAdapter` instance bound to this factory.
It registers `label.wayleave.eth` to the Kernel account and keeps the address
resolver at the adapter. It grants only the name-scoped `ROLE_SET_SUBREGISTRY`
bit so the account may attach a child registry later. It creates no child
registry automatically. NFT ownership does not determine DNS label depth.

The ENS namespace operator must separately grant the adapter registrar rights.
ENS ownership and its transfer rules are separate from the immovable identity
NFT. Existing deployed adapters/factories and their names are unchanged.

## Gateway onboarding transport

The gateway exposes wallet-free onboarding when `MANDATE_PASSKEY_FACTORY` and
the funded `MANDATE_PASSKEY_RELAYER_KEY` are configured. The browser creates a
resident P-256 credential, asks the gateway for a digest bound to the predicted
account, label and ten-minute deadline, and makes a second assertion over that
digest. The gateway accepts only the exact factory call, rate limits the public
routes, consumes each challenge once in SQLite, and stores the credential ID and
public key for later login. The relayer key is read only by the gateway process;
it is never returned to the browser.

Passkey login uses a separate five-minute WebAuthn challenge and verifies the
assertion's RP hash, origin, user-presence flag, challenge and P-256 signature
before issuing the existing HttpOnly session cookie. A stored credential is
metadata for discovery; login still requires the current public key and exact
origin. The gateway must be served on the same configured origin used to create
the credential (the local default is `http://localhost:3000`).

## Remaining onboarding work

- A funded relayer or paymaster for UserOperations. Kernel accounts
  cannot call EntryPoint v0.9 as their own bundler; the transport must be an EOA.
- A recovery/second-passkey flow and explicit root-rotation UX. NFT handover is
  intentionally unavailable and cannot recover a lost passkey.
- Integrating root accounts with existing child mandates and bounded agent
  policies. A passkey root does not grant an agent unrestricted signing access.

This change supplies the contracts and SDK encoding helpers. It does not make
passkey onboarding, recovery, gas sponsorship or a new Sepolia deployment live.

For a later Sepolia infrastructure deployment, `DeployPasskeySepolia.s.sol`
requires `MANDATE_KERNEL_FACTORY` (the verified existing Kernel factory), with
optional `MANDATE_PASSKEY_IDENTITY_ADAPTER`. It rejects all chains except
11155111. When using ENS, deploy a fresh adapter first, then bind it to the new
factory and grant its namespace registrar role. The script creates no user
account and prints the addresses to record with transaction evidence before
configuring clients.

## Local verification

Run `bun run check`, start Anvil with `bun run chain`, then run
`bun run smoke` and `bun run smoke:passkey`. The passkey smoke test deploys the
new stack, compares the SDK and Solidity registration digests, verifies the
predicted account and self-owned NFT, and executes a P256-authorized payment
through EntryPoint v0.9. Its generated signing key is ephemeral and never saved.

Both the Foundry passkey tests and Anvil passkey smoke use OpenZeppelin's real
software P256 verifier at the upstream fallback address because the local
Prague VM has no native P256 precompile. They do not mock successful signatures.
This verifies the contract flow and cryptographic signatures locally; it is not
evidence of a Sepolia passkey deployment or a browser authenticator ceremony.
