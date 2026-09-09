// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {AccountFactory} from "./AccountFactory.sol";
import {IIdentityAdapter} from "./interfaces/IAccountRegistry.sol";
import {KernelFactory} from "kernel-v4/KernelFactory.sol";
import {Install} from "kernel-v4/types/Structs.sol";
import {Kernel} from "kernel-v4/Kernel.sol";
import {ValidationId} from "kernel-v4/types/Types.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {WebAuthn} from "./vendor/zerodev/WebAuthn.sol";
import {WebAuthnValidator} from "./vendor/zerodev/WebAuthnValidator.sol";

/// @notice Passkey-controlled Kernel roots with a permanently self-owned identity NFT.
/// @dev The NFT is identity only. Root authority comes exclusively from the installed validator.
abstract contract PasskeyAccountFactoryBase is AccountFactory, EIP712 {
    struct Passkey {
        uint256 x;
        uint256 y;
    }
    KernelFactory public immutable kernelFactory;
    address public immutable passkeyValidator;
    mapping(bytes32 => address) public accountForKey;
    bytes32 public constant REGISTRATION_TYPEHASH =
        keccak256("RegisterPasskey(uint256 x,uint256 y,address account,bytes32 labelHash,uint256 deadline)");
    error PasskeyRequired();
    error SelfOwnedIdentity();
    error InvalidPasskey();
    error KeyAlreadyRegistered();
    error InvalidProof();
    error ExpiredProof();
    error UnexpectedAccountConfiguration();

    constructor(IIdentityAdapter adapter, KernelFactory factory_, address validator_)
        AccountFactory(adapter)
        EIP712("Wayleave Passkey Factory", "1")
    {
        require(address(factory_).code.length > 0 && validator_.code.length > 0, "Invalid modules");
        kernelFactory = factory_;
        passkeyValidator = validator_;
    }

    function keyHash(Passkey calldata key) public pure returns (bytes32) {
        return keccak256(abi.encode(key.x, key.y));
    }

    /// @dev Domain separation avoids sharing accounts across product factories. Label and NFT ID do not affect address.
    function accountNonce(Passkey calldata key) public view returns (uint256) {
        return uint256(keccak256(abi.encode("WayleavePasskeyAccount", block.chainid, address(this), keyHash(key))));
    }

    function _packages(Passkey calldata key) public view returns (Install[] memory packages) {
        packages = new Install[](1);
        // Upstream's credential-id hash is unused onchain. Keep it canonical so one public key has one initializer.
        packages[0] = Install(1, passkeyValidator, abi.encode(key.x, key.y, bytes32(0)), "");
    }

    function accountAddress(Passkey calldata key) public view returns (address) {
        return kernelFactory.getAddress(_packages(key), accountNonce(key));
    }

    function registrationDigest(Passkey calldata key, string calldata label, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(REGISTRATION_TYPEHASH, key.x, key.y, accountAddress(key), keccak256(bytes(label)), deadline)
            )
        );
    }

    /// @notice Anyone may relay an exact passkey-authorized registration; changing the label invalidates its proof.
    function createAccount(Passkey calldata key, string calldata label, uint256 deadline, bytes calldata proof)
        external
        nonReentrant
        returns (uint256 id, address account)
    {
        if (key.x == 0 || key.y == 0) revert InvalidPasskey();
        if (block.timestamp > deadline) revert ExpiredProof();
        bytes32 hash = keyHash(key);
        if (accountForKey[hash] != address(0)) revert KeyAlreadyRegistered();
        if (!_verifyProof(key, registrationDigest(key, label, deadline), proof)) revert InvalidProof();
        account = address(kernelFactory.deploy(_packages(key), accountNonce(key)));
        // Upstream permits predeployment. Reject accounts whose owner has subsequently changed their configuration.
        if (
            ValidationId.unwrap(Kernel(payable(account)).root())
                != bytes21(abi.encodePacked(bytes1(0x01), passkeyValidator))
        ) {
            revert UnexpectedAccountConfiguration();
        }
        _checkInstalledKey(account, key);
        accountForKey[hash] = account;
        id = _registerAccount(label, account, account);
    }

    function _verifyProof(Passkey calldata key, bytes32 digest, bytes calldata proof)
        internal
        view
        virtual
        returns (bool);
    function _checkInstalledKey(address account, Passkey calldata key) internal view virtual;

    function createAccount(string calldata) public pure override returns (uint256, address) {
        revert PasskeyRequired();
    }

    function proposeHandover(uint256, address) external pure override {
        revert SelfOwnedIdentity();
    }

    function cancelHandover(uint256) external pure override {
        revert SelfOwnedIdentity();
    }

    function acceptHandover(uint256) external pure override {
        revert SelfOwnedIdentity();
    }
}

/// @notice Concrete passkey factory using the vendored ZeroDev WebAuthn validator.
/// @dev The proof format is the validator's UserOp signature tuple. The proof is
/// checked against the requested public key before the deterministic account is deployed.
contract PasskeyAccountFactory is PasskeyAccountFactoryBase {
    WebAuthnValidator public immutable validator;

    constructor(IIdentityAdapter adapter, KernelFactory factory_, WebAuthnValidator validator_)
        PasskeyAccountFactoryBase(adapter, factory_, address(validator_))
    {
        validator = validator_;
    }

    function _verifyProof(Passkey calldata key, bytes32 digest, bytes calldata proof)
        internal
        view
        override
        returns (bool)
    {
        (
            bytes memory authenticatorData,
            string memory clientDataJSON,
            uint256 responseTypeLocation,
            uint256 r,
            uint256 s,
            bool usePrecompiled
        ) = abi.decode(proof, (bytes, string, uint256, uint256, uint256, bool));
        return WebAuthn.verifySignature(
            abi.encodePacked(digest),
            authenticatorData,
            true,
            clientDataJSON,
            23,
            responseTypeLocation,
            r,
            s,
            key.x,
            key.y,
            usePrecompiled
        );
    }

    function _checkInstalledKey(address account, Passkey calldata key) internal view override {
        (uint256 installedX, uint256 installedY) = validator.webAuthnValidatorStorage(account);
        if (installedX != key.x || installedY != key.y) revert InvalidPasskey();
    }
}
