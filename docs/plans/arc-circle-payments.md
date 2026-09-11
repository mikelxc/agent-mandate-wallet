# Arc and Circle cross-chain payments

Status: initial implementation complete, September 11, 2026. The fixed Arc Testnet to Base Sepolia route, owner-approved execution, durable reconciliation, and UI are locally tested. Read-only Circle configuration checks passed. Arc contract deployment and a real transfer remain outstanding; see [implementation and verification](../arc-circle.md).

## Outcome

An NFAT and its Kernel account live on Arc. An agent proposes a USDC payment to a merchant on another supported chain, and the owner approves its exact terms. Wayleave tracks source execution, destination settlement and service delivery. The NFT stays on Arc; a merchant does not need a destination NFAT account.

Start with Arc Testnet to Base Sepolia using CCTP. Use [Graph MCP history](subgraph-mcp.md) for historical reconciliation and [ENSv2 identity](ensv2-portable-identity.md) for portable agent enrollment. Each integration has its own evidence and authority boundary.

## Current foundation and compatibility gate

The current stack uses Sepolia, Kernel v4, EntryPoint 0.9, an external-owner authorization path and owner-held ERC-20 funds accessed through a capped allowance. The newer passkey account has separate validator requirements. Existing gateway and MCP schemas contain Sepolia-specific configuration.

Before deployment, verify the pinned Kernel/EntryPoint bytecode and compiler target work on Arc, along with bundler restrictions and gas estimation. For any passkey path, independently verify the P256 verifier and signature format. Use explicit per-chain configuration and deployment manifests throughout the contracts, SDK, gateway and frontend.

Arc's published Testnet chain ID is 5042002; native USDC gas uses 18 decimals. Verify the canonical ERC-20 USDC interface and decimals independently and account for its relationship to native balance. Do not count native and ERC-20 views of the same funds twice or apply six-decimal payment conversions to gas values. Recheck addresses and chain/domain mappings before execution.

## First delivery: exact CCTP payment

1. Add a canonical cross-chain payment intent containing source account/chain/token, destination chain and Circle domain, destination token/recipient, amount semantics, maximum fee, business reference and idempotency key. Define whether the requested amount means source debit or merchant receipt; display both and require a new approval for material changes.
2. Build a constrained execution path. Where funds remain with the owner, pull only the authorized amount into the Kernel account, grant an exact allowance to the verified CCTP contract, and invoke the supported burn method for the approved destination. Verify batch atomicity and failure handling. Do not expose generic calldata or an unrestricted agent signer.
3. Verify the source receipt, inner UserOperation result and emitted Circle message. Persist those identifiers before progressing.
4. Obtain the Circle attestation and submit the destination mint, or use Circle Forwarding after verifying its route support, fees and failure behavior. A destination relayer supplies gas without authority to change the attested recipient or amount.
5. Verify destination mint/token effects before marking payment settled. Record service delivery as a separate outcome. A paid service can still fail to deliver.

Pin current CCTP V2 interfaces and deployments. Do not copy legacy tutorial ABIs without checking them. Circle domain identifiers are not EVM chain IDs. Begin with a plain merchant transfer; arbitrary destination contract execution is outside this milestone.

## Operation lifecycle

Track approval, source submission, source inclusion, attestation pending, destination submission, destination settlement and delivery independently. Preserve failure details and transaction identifiers so work resumes after a restart.

Retry settlement using the existing message, not another source burn. If an attestation expires, follow the supported refresh procedure. An ambiguous source submission needs reconciliation before retrying. Revoking API access cannot undo an accepted source burn, and settlement should remain recoverable after the agent disconnects.

Define the precise binding between business request and signed operation. Gateway idempotency does not by itself guarantee protocol-wide exactly-once payment. The current owner validator also does not enforce an onchain expiry; any claimed cancellation/deadline needs explicit validator support or carefully described service-only semantics.

## Later option: Gateway-funded budgets

Evaluate Circle Gateway after the exact-payment flow if users need a prefunded balance accessible across chains. This changes owner-held funding into an explicitly deposited budget and needs a separate design review.

Current Gateway documentation describes ERC-1271 support through offchain TEE/RPC validation. Verify compatibility with our precise Kernel authorization envelope. Validation is read-only and may reflect state up to five minutes old; it cannot update a cumulative onchain counter during signature validation. This path does not currently include Nanopayments. Document revocation timing, accepted-intent behavior and the delayed trustless withdrawal path. Do not introduce an unrestricted EOA delegate as a workaround.

## Verification and completion

Preserve existing Sepolia deployment guards; add dedicated chain-guarded scripts for approved target deployments. This plan does not authorize mainnet deployment. Keep all signing secrets outside the frontend.

Use Bun and Foundry, synchronize ABIs with `bun run abi`, run `bun run check` for cross-stack changes and `bun run smoke` against Anvil for execution/deployment work. Add focused tests for incorrect domains/recipients, fee caps, inner execution failures, restart recovery and duplicate settlement attempts.

Completion requires a real testnet-USDC transfer from the Arc NFAT account to the destination merchant, recorded contracts and source/destination transactions, verified token effects, and a recoverable operation shown through the gateway/MCP. Circle integration does not automatically imply Circle Agent Stack integration or autonomous spending.

## References

- [Arc network configuration](https://docs.arc.io/arc/references/connect-to-arc)
- [CCTP chains and domains](https://developers.circle.com/cctp/concepts/supported-chains-and-domains)
- [CCTP contract addresses](https://developers.circle.com/cctp/references/contract-addresses)
- [Forwarding Service](https://developers.circle.com/cctp/concepts/forwarding-service)
- [Gateway contract authorization](https://developers.circle.com/gateway/references/erc-1271)
- [Current Kernel architecture](../kernel.md)
