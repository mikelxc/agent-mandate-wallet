# Kernel wallet and owner-balance authority

The product factory is still the NFT registry. It deploys a Kernel v4 account with NFTOwnerValidator as its default root. Token allowances name that individual account address, never the shared implementation or NFT token ID. No extra spending contract is deployed.

## Setup and execution

1. Read the next token ID and deterministic account address.
2. Call `createAccountChecked(label, expectedId)` and then `token.approve(account, cap)` from the owner's wallet. The ID check rejects a stale prediction rather than approving a competing mint's account. Use EIP-5792 atomic calls only if the wallet reports support. A standalone Multicall contract changes `msg.sender` and cannot approve the EOA's tokens. With sequential transactions, verify the deployed registry binding and current owner before approving.
3. The owner retains tokens. The account calls `transferFrom(owner, recipient, amount)` when a signed operation executes. The token contract enforces remaining allowance at execution, including multiple operations validated in one bundle.
4. The owner signs `AccountAuthorization(account, tokenId, epoch, actionHash)` using the validator's EIP-712 domain. The action hash is the EntryPoint's UserOperation hash. The current owner and current epoch are read at validation. EntryPoint supplies nonce replay protection.
5. An undelegated EOA sends `handleOps` and pays transaction gas, receiving the account's gas reimbursement. The connected wallet can do this in v1; it is the signer, while NFTOwnerValidator is the onchain validator. The account needs a separate native gas balance or EntryPoint deposit. ERC-20 allowance does not cover gas.
6. Confirm both the outer receipt and the matching `UserOperationEvent.success`. A successful outer transaction can contain a failed payment. Show actual token effects separately from offchain delivery.

Wallet-native batching and self-bundling are not universally compatible: the pinned EntryPoint 0.9 rejects callers with code and requires `tx.origin == msg.sender`. A smart wallet or EIP-7702-delegated owner therefore needs a separate EOA bundler. The frontend explains this at submission; hosted bundling is pending. Batch submission failures never trigger automatic sequential retries. Load the displayed account ID to recover after ambiguous confirmation.

Native ETH cannot be approved via ERC-20 allowance. Tokens with permit/transfer authorization can offer signature-based funding, but token-specific integrations are not part of this demo. A token approval transaction and a signed UserOperation are distinct authorizations.

## Threat boundary

A standing allowance is a maximum exposure, not an intent policy. It has no standard recipient, purpose, expiry, or NFT-epoch restriction. NFT transfer does not revoke the former owner's token allowance; the new controller can spend it. An explicit integration test demonstrates this. Revoke before handover, and avoid oversized approvals. Revocation cannot undo a previously ordered payment.

Root signatures permit Kernel execution and configuration, including upgrades and alternate modules. NFT ownership is the default control mechanism, not an immutable governance guarantee. No autonomous agent signer, ZeroDev/Rhinestone policy module, or universal business-request deduplication is installed. Old signed operations fail after an ownership epoch change, but external approvals and installed module state do not reset. Full handover cleanup remains a separate design task.

The original OperatingAccount contract is retained for its policy reference tests and the UI labels it accordingly. Those tests do not prove that Kernel root operations obey the same limits. ENS has no live parent configured; the deployed registry uses a zero identity adapter. Alchemy can replace the public Sepolia transport later; balance reads already work without it.

## Pinned sources

- [Kernel v4 dev revision f2a84a3](https://github.com/zerodevapp/kernel/tree/f2a84a332ec5a722e7e95a0d64601905c3c87fe9), domain version 0.4.0. The old `v4.0.0-beta.*` tags date to a different historical code line; they are not the source used here.
- [EntryPoint v0.9.0](https://github.com/eth-infinitism/account-abstraction/tree/v0.9.0), canonical Sepolia address recorded in the deployment manifest.
- [EIP-5792 Wallet Call API](https://eips.ethereum.org/EIPS/eip-5792).

Vendored upstream source is unmodified. Solidity 0.8.33, Prague, optimizer and via-IR are configured in foundry.toml. Upstream SPDX/license terms remain in each dependency; the root MIT license does not replace them. This is a development test deployment, not an audited production release.

## Guided payment funding

Payment review now checks the requested account binding, current owner, owner
wallet type, demo token balance, account allowance and EntryPoint deposit inside
the payment card. It offers only missing setup steps, one wallet confirmation at
a time, and returns to exact-payment preparation once funding is confirmed.
There is no automatic signing, wallet delegation, or setup on receipt of an agent
request. The owner explicitly selects each displayed transaction.

The demo faucet mints only the shortfall to the owner. An insufficient allowance
is replaced with exactly the requested payment amount, never an unlimited value.
A sufficient existing allowance is preserved. Gas funding covers the displayed
660,000-gas reservation at the quoted capped fee; unused funds remain deposited.
Each write rechecks scope and live funding. A changed transaction requires another
review tap. Pending transaction hashes are retained in the open setup card so a
confirmation timeout can be checked without sending a duplicate transaction.
Reloading the page requires a fresh chain check; it is not proof that a pending
transaction was cancelled. Confirm its wallet status before retrying after reload.

Setup approvals remain standard ERC-20 allowances: they persist if the user stops,
and lack recipient/expiry/ownership-epoch restrictions. The card explains that
residual exposure. The signed payment still passes the gateway's funding checks,
nonce/owner checks, signature verification and EntryPoint simulation. Setup
receipts are labelled separately from payment inclusion.

A single transaction for approval, deposit and payment is not implemented: the
current token has no permit and EntryPoint 0.9 forbids contract/delegated callers
of handleOps. Generic multicall would approve the wrong token owner. Supporting
that UX requires an explicitly designed token authorization/sponsorship path or
wallet-native batching with a separate bundler and revised gateway simulation;
merely switching to wallet_sendCalls would not work safely with this deployment.
