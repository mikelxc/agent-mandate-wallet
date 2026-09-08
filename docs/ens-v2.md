# Wayleave ENSv2 setup and verification

Source checked September 7, 2026:

- [ETHOnline ENSv2 deployment](https://feature-permres-inode-refact.docs-bao.pages.dev/learn/deployments#sepolia-ensv2-beta)
- [Hackathon ENS App](https://hackathon-deployment-manager-app-v4.ens-cf.workers.dev/)
- [Hackathon ENS Explorer](https://hackathon-deployment-portal-app.ens-cf.workers.dev/)

This project targets the dedicated ETHOnline 2026 ENSv2 deployment on Sepolia.
It is separate from both production ENS and the standard Sepolia ENSv2 beta.

## Addresses used by the project

| Component | Address |
| --- | --- |
| ETHRegistry | `0x1d78834d97c1d7b1a38c1dedbd1a287cfed3971e` |
| ETHRegistrar | `0x7d1b7f586a62ac3f54b9a396849757814283270b` |
| PublicResolverV2 | `0xf9de4979ddb290baf5b760d0e788125017bc33f6` |
| UpgradableUniversalResolverProxy | `0xd26f2040d083af1cd2962ba303f4bea0c4faf142` |
| VerifiableFactory | `0x894bc9cc8ff1ad96b8a288c86a8c71d662c07780` |
| Wayleave Permissioned Resolver | `0x44974A0CD84A563BC599Af7ff573B85137B172CB` |
| Wayleave UserRegistry | `0xBBfc3F1f529593ca1aa4D727121Ad4896e66fA34` |
| Wayleave identity adapter | `0x03AEcb257c931A5eB18F18cCAD9f6d9B584ad44b` |
| Wayleave product factory | `0xf0C862D40eE1E9637a6B8634E75ebc86aeCCa3dE` |

The frontend overrides viem's built-in Sepolia Universal Resolver with the
hackathon proxy. Do not replace these addresses with the production deployment
table for this hackathon build.

## Resolver versus address record

A resolver is a contract that stores or computes records. It is not the NFAT
smart-account address. `wayleave.eth` now uses its own verified Permissioned
Resolver proxy and resolves to its operator address.

The parent record is optional for NFAT subnames. The project's identity adapter
acts as the resolver for each child and maps, for example,
`research.wayleave.eth` to that NFAT's stable Kernel account address.

## Live verification

Run:

```sh
bun run ens:status
```

This reports:

- `registered: true`
- a nonzero owner and future expiry
- the expected resolver if the parent itself should resolve
- a nonzero subregistry before automated child registration is enabled

On September 7, `wayleave.eth` was registered for
`0x96B0D15128748cE191B79c75560Ed93695788865` in transaction
`0xd033f58bdbc9ffcbe5a01d700026a0ee80e1ec591cb8d3184a765c35230ecdd6`.
The registration evidence is stored in
`deployments/ensv2-wayleave-sepolia.json`.

The resolver, UserRegistry, identity adapter, and product factory were then
deployed and connected directly on Sepolia. Both proxies pass the hackathon
VerifiableFactory provenance check. The adapter has only `ROLE_REGISTRAR` on
the UserRegistry root; it has no renew, unregister, resolver, subregistry,
transfer, or upgrade role.

NFAT #1 is the live proof path:

- Name: `research-desk.wayleave.eth`
- Smart account: `0x2f86Ce1feCa9b2B722Bab2b402c9fA24F613b60A`
- Creation transaction: `0x301e424d5f10ee1a0b27d5344dc6d8141ef9f6066168778e379f376997ef12e3`
- Universal Resolver result: the same smart-account address

The complete namespace evidence is stored in
`deployments/wayleave-namespace-sepolia.json`.

## Reproducible setup

The chain-guarded Foundry script deploys the two verified proxies, attaches
them to `wayleave.eth`, sets the parent address record, deploys and binds the
identity adapter and product factory, and grants the adapter only its registrar
role. It refuses to overwrite an existing resolver or subregistry.

```sh
cd packages/contracts
forge script script/DeployWayleaveSepolia.s.sol \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --keystore ../../.secrets/sepolia-deployer.json \
  --password-file ../../.secrets/sepolia-deployer.password \
  --sender 0x96B0D15128748cE191B79c75560Ed93695788865 \
  --broadcast --slow
```

The deployment is already complete, so the script's overwrite guards make a
second broadcast fail intentionally. To run a fresh proof under a different
available label, set `AGENT_LABEL` and run `bun run ens:smoke --broadcast`.

The adapter's fixed ASCII label grammar avoids Unicode normalization ambiguity.
Its child expiry is fixed at deployment and cannot exceed the parent lifetime;
renewal support is a follow-up before long-lived accounts.

## Chain boundary

This integration is Sepolia-only. Do not configure these addresses on Arc or
claim that a Sepolia name controls an account on another chain. Cross-chain ENS
ownership would require an authenticated synchronization design and separate
verification evidence.
