// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;
import {IValidator} from "kernel-v4/interfaces/IERC7579Modules.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IAccountRegistry} from "./interfaces/IAccountRegistry.sol";
interface IRegisteredAccounts is IAccountRegistry { function accountOf(uint256 id) external view returns (address); }

/// @notice Default Kernel validator: current NFT owner signs an account- and ownership-epoch-bound authorization.
contract NFTOwnerValidator is IValidator, EIP712 {
    struct Binding { IRegisteredAccounts registry; uint256 tokenId; }
    mapping(address => Binding) public bindings;
    bytes32 public constant AUTHORIZATION_TYPEHASH = keccak256("AccountAuthorization(address account,uint256 tokenId,uint256 epoch,bytes32 actionHash)");
    error InvalidBinding();
    constructor() EIP712("Mandate NFT Owner Validator", "1") {}
    function onInstall(bytes calldata data) external payable {
        if (address(bindings[msg.sender].registry) != address(0)) revert InvalidBinding();
        (address registry, uint256 tokenId) = abi.decode(data, (address, uint256));
        if (registry.code.length == 0 || tokenId == 0) revert InvalidBinding();
        bindings[msg.sender] = Binding(IRegisteredAccounts(registry), tokenId);
    }
    function onUninstall(bytes calldata) external payable { delete bindings[msg.sender]; }
    function isModuleType(uint256 moduleTypeId) external pure returns (bool) { return moduleTypeId == 1; }
    function isInitialized(address account) external view returns (bool) { return address(bindings[account].registry) != address(0); }
    function authorizationDigest(address account, bytes32 actionHash) public view returns (bytes32) {
        Binding memory binding = bindings[account];
        if (address(binding.registry) == address(0) || binding.registry.accountOf(binding.tokenId) != account) revert InvalidBinding();
        return _hashTypedDataV4(keccak256(abi.encode(AUTHORIZATION_TYPEHASH, account, binding.tokenId, binding.registry.ownershipEpoch(binding.tokenId), actionHash)));
    }
    function _valid(address account, bytes32 hash, bytes calldata signature) internal view returns (bool) {
        Binding memory binding = bindings[account];
        if (address(binding.registry) == address(0) || binding.registry.accountOf(binding.tokenId) != account) return false;
        return SignatureChecker.isValidSignatureNow(binding.registry.ownerOf(binding.tokenId), authorizationDigest(account, hash), signature);
    }
    function validateUserOp(PackedUserOperation calldata op, bytes32 opHash) external payable returns (uint256) {
        if (op.sender != msg.sender) return 1;
        return _valid(msg.sender, opHash, op.signature) ? 0 : 1;
    }
    function isValidSignatureWithSender(address, bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return _valid(msg.sender, hash, signature) ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
