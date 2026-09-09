# Vendored ZeroDev WebAuthn validator

These sources are vendored from ZeroDev's `kernel-7579-plugins` repository at
master commit `332deed6eeef3d6279cde50aa1d51eff53728bd4` (retrieved 2026-09-08).
The upstream project and these sources are MIT licensed.

The validator source adapts import paths and constants for this repository's
Kernel v4 interfaces and OpenZeppelin remapping, and declares the upstream
initialization errors omitted by the local interface. The cryptographic checks,
signature tuple, P256 precompile/fallback addresses, and WebAuthn policy checks
remain upstream behavior. The validator implements the local Kernel v4
`IValidator` ABI, including `isValidSignatureWithSender`.

Upstream source references:

- https://github.com/zerodevapp/kernel-7579-plugins/blob/332deed6eeef3d6279cde50aa1d51eff53728bd4/src/validators/WebAuthnValidator.sol
- https://github.com/zerodevapp/kernel-7579-plugins/blob/332deed6eeef3d6279cde50aa1d51eff53728bd4/src/utils/WebAuthn.sol
- https://github.com/zerodevapp/kernel-7579-plugins/blob/332deed6eeef3d6279cde50aa1d51eff53728bd4/src/utils/P256.sol
- https://github.com/zerodevapp/kernel-7579-plugins/blob/332deed6eeef3d6279cde50aa1d51eff53728bd4/src/utils/Base64URL.sol

`onInstall` expects `abi.encode(WebAuthnValidatorData, bytes32)`, where the
first tuple contains `pubKeyX` and `pubKeyY`; the trailing bytes32 is retained
for compatibility with the upstream SDK's credential-id hash enable data.
