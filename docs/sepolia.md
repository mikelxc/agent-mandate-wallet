# Sepolia test deployment

Deployed and exercised September 5, 2026 on chain 11155111. Deployer: `0x96B0D15128748cE191B79c75560Ed93695788865`. Funded with 0.5 test ETH; approximately 0.47909 remains after deployment and the first smoke test, with 0.005 initially deposited for account gas.

| Component | Address |
| --- | --- |
| Canonical EntryPoint 0.9 | `0x433709009B8330FDa32311DF1C2AFA402eD8D009` |
| Kernel implementation | `0x1de2280927f27B98607cF5029EA0C10D909Bd773` |
| Kernel factory | `0x06f085A6c6E4f12Ea1044B708412168674e6faD4` |
| NFT owner validator | `0xe4cB1515BD7aC3D43f979392517EB35964A7b7cc` |
| Product factory / NFT registry | `0x39cB47aA65594767d1e456bd329Aad849EC98345` |
| Freely mintable demo USDC | `0x3C14067e0dbD276c083908C1D9D2f2Dc0A65ca41` |
| Demo account #1 | `0xf4462268feEf5AB89e627F3C947Bd40C087C5F4d` |

[Public manifest](../deployments/sepolia.json) records seven successful deployment receipts, runtime code hashes, and upstream Kernel revision. EntryPoint code presence and its expected SenderCreator were checked before deployment. Explorer source verification has not been performed.

[Payment transaction](https://sepolia.etherscan.io/tx/0x640020603186197879a755345e3699e35059f4b8b8e363e630e208fc03eb09ee) successfully executed a signed UserOperation, transferring 3 demo USDC from the owner's balance to `0x000000000000000000000000000000000000bEEF`. The smoke test checked the matching UserOperation success event and both balance deltas. [Evidence](../deployments/sepolia-smoke.json). The remaining allowance was [revoked](https://sepolia.etherscan.io/tx/0x4a7177e892a2fe48669dfc538a40ec9d0751311a9c7094c51334f8346f5d0fd2).

## Reproduction

```sh
bun run check
# From packages/contracts; omit --broadcast for simulation.
forge script script/DeployKernelSepolia.s.sol \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --keystore ../../.secrets/sepolia-deployer.json \
  --password-file ../../.secrets/sepolia-deployer.password \
  --sender 0x96B0D15128748cE191B79c75560Ed93695788865 --broadcast --slow
# From repository root, exercise the EXISTING deployment (mints demo tokens and uses test gas).
bun scripts/sepolia-smoke.ts --broadcast
```

The deployment script rejects other chains. Rerunning it creates new addresses; update the manifest and SDK configuration if intentionally redeploying. The smoke script targets the recorded deployment and revokes allowance after its payment attempt.

The encrypted keystore and local password are ignored under `.secrets/` (directory0700, files0600). Encryption does not protect against a process that can read both files. Credentials never enter the frontend or repository.

See [Kernel architecture and authority limits](kernel.md). ENS, hosted bundler, agent-policy modules, and token-specific signed permits are not live. The frontend's wallet-native batch branch is implemented but has not been exercised against an injected browser wallet; the confirmed test used sequential EOA setup and direct self-bundling.
