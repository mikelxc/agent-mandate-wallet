// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;
import {AccountFactory} from "./AccountFactory.sol";
import {IIdentityAdapter} from "./interfaces/IAccountRegistry.sol";
import {NFTOwnerValidator} from "./NFTOwnerValidator.sol";
import {KernelFactory} from "kernel-v4/KernelFactory.sol";
import {Install} from "kernel-v4/types/Structs.sol";

/// @notice Product-facing NFT registry; delegates account deployment to pinned upstream Kernel v4.
contract KernelAccountFactory is AccountFactory {
    KernelFactory public immutable kernelFactory;
    NFTOwnerValidator public immutable defaultValidator;
    constructor(IIdentityAdapter adapter, KernelFactory factory_, NFTOwnerValidator validator_) AccountFactory(adapter) {
        require(address(factory_).code.length > 0 && address(validator_).code.length > 0, "Invalid modules");
        kernelFactory = factory_; defaultValidator = validator_;
    }
    function _packages(uint256 id) internal view returns (Install[] memory packages) {
        packages = new Install[](1);
        packages[0] = Install({moduleType:1, module:address(defaultValidator), moduleData:abi.encode(address(this), id), internalData:""});
    }
    function nextAccountAddress() external view returns (uint256 id, address account) {
        id = nextTokenId; account = kernelFactory.getAddress(_packages(id), id);
    }
    function createAccountChecked(string calldata label, uint256 expectedId) external returns (uint256 id, address account) {
        require(nextTokenId == expectedId, "Account prediction changed");
        return createAccount(label);
    }
    function _deployAccount(uint256 id) internal override returns (address) {
        return address(kernelFactory.deploy(_packages(id), id));
    }
}
