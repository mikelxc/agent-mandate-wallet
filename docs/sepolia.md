# Sepolia test deployment

Dedicated deployment wallet: `0x96B0D15128748cE191B79c75560Ed93695788865`.

Chain: Ethereum Sepolia (`11155111`). Only send Sepolia test ETH. This address is public; the keystore and password are local-only under ignored `.secrets/`, with directory mode 0700 and files mode 0600. The password is stored locally for unattended test deployments; encryption does not protect against a process that can read both files. No credentials enter the frontend, logs, or repository.

No deployment has been broadcast yet. Funding is pending. The deployment script below targets the existing payment-account reference prototype, not a Kernel integration.

```sh
bun run contracts:build
# Run from packages/contracts; paths below point to the root's ignored credentials.
forge script script/DeploySepolia.s.sol:DeploySepolia \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --keystore ../../.secrets/sepolia-deployer.json \
  --password-file ../../.secrets/sepolia-deployer.password
```

Append `--broadcast` to the exact successfully simulated command when funded and ready. The script rejects all other chains. It deploys AccountFactory and a clearly marked, freely mintable demo token. ENS is disabled unless a configured adapter is explicitly supplied through `ENS_IDENTITY_ADAPTER`; live ENS enrollment still requires the controlled parent registry and adapter factory binding.

After broadcasting, record chain, deployer, transaction hashes, contract addresses, source commit and verification results in a public deployment manifest. Never commit raw keystores or password files, including inside deployment artifacts.

## Kernel direction

The current account is a behavioral reference for policy tests. For the customizable wallet, use a pinned Kernel account and implement the ownership/mandate extensions rather than growing a second general-purpose wallet.

Checked September 5, 2026: Kernel has stable `v3.3` and newer `v4.0.0-beta.*` tags; ZeroDev SDK latest npm version is `5.5.10`. Choose v3.3 for the initial stable integration and confirm compatible EntryPoint, SDK and deployed bytecode before use. Do not treat the repository's development branch as a stable deployment target.

Suggested split:
- NFT ownership validator: root signatures authorized by the registry's current owner; owner epoch included in signed authorization domains to prevent round-trip ownership replay.
- Mandate validator or existing Kernel permission signer/policies: agent authentication, allowed call encoding, expiry, revocation and epoch binding.
- Paired execution hook (or tightly scoped executor): recheck authority at execution, atomically account for spend and business request IDs, emit receipts. Multiple UserOperations can validate before execution; checking remaining balance only at validation can overspend.
- AccountFactory remains the product-facing NFT/account registry but creates Kernel accounts via the appropriate factory. ENS continues to reference the stable account address.

Integration tests must cover actual EntryPoint validation/execution, multiple operations in one bundle, stale grants after handover, failed execution accounting, alternate validators/executors, batched calls, delegatecall, approvals, signature validation, and root-configuration changes. A root validator that reads NFT ownership does not by itself make the binding permanent: Kernel root changes/upgrades and module installation need an explicit allowed-governance policy.

Sources: https://github.com/zerodevapp/kernel/tree/v3.3 and https://docs.zerodev.app/smart-accounts/permissions/intro
