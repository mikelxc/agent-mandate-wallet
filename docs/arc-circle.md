# Arc and Circle payments

The implementation supports one explicitly configured route: Arc Testnet (5042002, Circle domain 26) to Base Sepolia (84532, domain 6). The external-owner NFAT stack was deployed to Arc Testnet with explicit user authorization on September 11, 2026. No real Circle transfer has been performed. Existing Sepolia deployment scripts remain unchanged; other public-chain deployments still require explicit authorization.

## Verified testnet deployment

[Public deployment evidence](../deployments/arc-testnet.json) records six successful transactions: five contract deployments and creation of NFAT `arc-research` (token 1). The account is `0xf4462268feEf5AB89e627F3C947Bd40C087C5F4d`; the registry is `0x39cB47aA65594767d1e456bd329Aad849EC98345`. Ownership and validator binding were read back from Arc. ENS remains on Sepolia; the Arc identity adapter is zero.

Actual deployment gas was 13,260,625, costing 0.29173375 native USDC; the deployer retained 19.70826625 USDC. The pre-existing canonical EntryPoint 0.9 runtime matched the verified Sepolia runtime byte for byte after replacing its two chain-specific EIP-712 immutable words. New contract executable runtime matched compiled artifacts after excluding declared immutables and compiler metadata. Explorer source verification, passkey execution and CCTP payment execution remain unverified.

`packages/contracts/script/DeployKernelArc.s.sol` is guarded to chain 5042002, the authorized deployer, canonical EntryPoint code hash, Circle domain and six-decimal USDC. Its dry run succeeded before broadcast. `bun scripts/record-arc-deployment.ts` rechecks public evidence without signing or broadcasting. `packages/subgraph/subgraph.arc-testnet.yaml` targets the deployed registry starting at block 61600603; its local build does not establish hosted indexing.

## Configuration and verification

Set `ARC_RPC_URL` and `BASE_SEPOLIA_RPC_URL` to testnet RPCs. Set all four deployment values: `ARC_REGISTRY`, `ARC_VALIDATOR`, `ARC_ENTRY_POINT`, `ARC_KERNEL`. These must identify a verified external-owner NFAT/Kernel deployment on Arc; do not substitute Sepolia addresses. With these absent, the gateway reports Arc unavailable. Partial configuration fails closed.

Run `bun scripts/arc-status.ts` for a read-only RPC/domain/token preflight. It does not establish Kernel compiler-target compatibility, passkey compatibility, or successful payments. Those require deployment and execution evidence. The adapter checks both RPC chain IDs, deployment code presence, Circle domains and ERC-20 decimals before preparing or verifying operations. Approval simulation checks the actual signed batch before submission.

Arc's native USDC gas amounts have 18 decimals. The ERC-20 payment interface has 6 decimals. They are two views of the same balance; never sum them. EntryPoint deposits are separately escrowed native USDC, and the owner sending `handleOps` needs native gas as well.

Read-only preflight completed at `2026-09-11T15:25:35.607Z`: both RPC chain IDs, Circle domains and ERC-20 decimals matched. At that preflight no Arc NFAT deployment was configured; the later deployment evidence above supersedes that deployment status. Cross-chain payment execution remains unverified.

## Exact payment flow

The SDK accepts only `source_debit` amounts in integer USDC base units: merchant receipt is source amount minus Circle's actual fee, bounded by the approved maximum fee. Native gas is additional. Both chains, domains, canonical tokens, recipient and fee bound are immutable economic terms of the prepared UserOperation. The owner validator signs its EntryPoint hash with the current NFT ownership epoch.

The account executes an atomic default-mode ERC-7579 batch: pull exact USDC from the current owner, clear prior Circle allowance, approve the exact debit, invoke CCTP V2 `depositForBurn`, then clear the allowance. There is no arbitrary target, destination hook, forwarding service or agent signer. The configured owner requires an existing capped allowance to its account. Local Foundry tests prove burn failure rolls the owner pull and approvals back through the real Kernel/EntryPoint path, using an explicitly simulated Circle contract.

The business reference and idempotency key are gateway correlation fields, not onchain expiry/cancellation guarantees. Two business references with identical economic terms produce identical execution calldata. EntryPoint nonce and owner signature bind the actual execution. Preparing once and preserving its hash prevents the gateway from silently preparing another burn on retries. There is no automatic source resubmission or cancellation.

## HTTP API

Mount `createCctpRoute` through the gateway integration routes and supply the dashboard audience. Cookie-authenticated writes require its exact Origin. The owner must control the Arc account. Prepared operations, signatures, source wire messages, attestations and receipts are stored in the gateway SQL database, using revision checks and owner-scoped idempotency.

- `GET /crosschain/config`: availability, chain IDs and configured EntryPoint.
- `GET /crosschain`: `{ operations, available, mode, route }` for the authenticated owner.
- `POST /crosschain` with `{ intent }`: create/reuse an immutable payment request.
- `POST /crosschain/:id/prepare` with `{}`: `{ operation, prepared, summary }`.
- `POST /crosschain/:id/approve` with `{ signature }`: simulate and store owner approval.
- The owner sends `EntryPoint.handleOps` on Arc using `prepared.op` and that signature.
- `POST /crosschain/:id/source` with `{ transactionHash }`: persist the hash before reconciliation, require successful inner UserOperation and one matching Circle wire message.
- `POST /crosschain/:id/attestation` with `{}`: poll Circle sandbox, match immutable wire fields to the source message and approved terms; return `{ operation, mint }` when ready, or HTTP 202 while pending.
- A wallet/relayer sends the returned direct `receiveMessage` call on Base Sepolia.
- `POST /crosschain/:id/destination` with `{ transactionHash }`: verify direct mint input, consumed Circle nonce and exact USDC mint effects before marking `settled`.

Agent integrations may supply an explicit Arc-scoped authentication callback to enable `POST /agent/crosschain` and `GET /agent/crosschain/:id`. It must prove the account/owner/connection association on Arc. Existing Sepolia bearer tokens are not automatically accepted. Agent output excludes owner signatures and prepared execution payloads. Agents can only propose or read their own operations; all approvals remain owner-only.

A source hash is durable even when RPC inclusion is ambiguous; reconcile it instead of creating a new burn. Destination retries reuse the same attested message and Circle nonce. The first route uses finalized Standard transfers, not Fast transfers. Re-attestation/expired-message recovery and automatic destination relaying are not implemented. A failed or stale preparation needs operator reconciliation; there is intentionally no second preparation after approval. Session revocation does not erase recoverable payment records. Service delivery is independently `not_recorded`; settlement is not a delivery claim.

## Sources

Pinned against official documentation on September 11, 2026:

- [Circle deployments](https://developers.circle.com/cctp/references/contract-addresses)
- [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [CCTP V2 interfaces](https://developers.circle.com/cctp/references/contract-interfaces)
- [CCTP V2 wire format](https://developers.circle.com/cctp/references/technical-guide)
- [Arc chain and USDC balance semantics](https://docs.arc.io/arc/references/connect-to-arc)
