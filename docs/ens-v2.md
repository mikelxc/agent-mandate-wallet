# ENSv2 setup and verification

Sources checked September 5, 2026:
- https://docs.ens.domains/ensv2/tutorial-contract-developers/
- https://docs.ens.domains/ensv2/permissioned-registry/
- https://docs.ens.domains/learn/deployments/

ENSv2 beta currently runs on Sepolia. No deployment address is assumed or hard-coded.

## Configuration sequence

1. Acquire/control a Sepolia parent name. Deploy or use its ENSv2 UserRegistry. Point the parent name's subregistry to it; merely minting a label in an unattached registry does not make it resolve.
2. Verify the current deployed registry ABI against the adapter's minimal interface. `register` takes label, owner, subregistry, resolver, role bitmap and absolute expiry.
3. Deploy ENSV2IdentityAdapter with that registry, the full parent namehash, and an expiry no later than the parent lifetime. This minimal adapter has no renewal method; renewability is a follow-up before long-lived accounts.
4. Deploy AccountFactory with the adapter address. From the adapter deployer, call `bindFactory` exactly once, immediately in the same deployment script.
5. Grant the adapter `ROLE_REGISTRAR` on the parent registry's root resource. Check the current ENS RegistryRolesLib rather than guessing role bits. The registry administrator must hold the appropriate admin capability.
6. Create an account through the factory. Verify factory `AccountCreated`, adapter `IdentityRegistered`, ENS registration events, and `addr(namehash)`.
7. Resolve the fully qualified name through the deployed ENSv2 Universal Resolver and viem. This live integration check is required; the mock unit test is not a substitute.
8. Hand over account ownership and confirm address resolution remains stable while the old mandate becomes unusable.

The adapter also acts as a minimal legacy `addr(bytes32)` resolver and implements ERC-165 plus ERC-1155 receipt support. Additional record types, metadata and resolver-interface coverage must be verified/extended against the beta as needed. The fixed ASCII account-label grammar deliberately avoids Unicode normalization ambiguity.

## Arc

Do not configure a Sepolia registry address on Arc. Options for the next milestone are a separate Sepolia identity registry plus verified cross-chain enrollment, or keeping the ENS proof on Sepolia while Arc accounts are discovered through explicitly authenticated records. Do not use cross-chain ENS ownership as a spending authority without an authenticated state synchronization design.
