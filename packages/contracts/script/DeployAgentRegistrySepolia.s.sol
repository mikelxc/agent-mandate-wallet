// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Script} from "forge-std/Script.sol";
import {WayleaveAgentRegistry, IWayleaveParentRegistry} from "../src/WayleaveAgentRegistry.sol";

interface IAttachAgentRegistry is IWayleaveParentRegistry {
    function getSubregistry(string calldata) external view returns (address);
    function setSubregistry(uint256, address) external;
    function hasRoles(uint256, uint256, address) external view returns (bool);
}

/// @notice For directly owned external names; account-owned names must execute attachment through their account.
contract DeployAgentRegistrySepolia is Script {
    function run() external returns (WayleaveAgentRegistry registry) {
        require(block.chainid == 11155111, "Sepolia only");
        IAttachAgentRegistry parent = IAttachAgentRegistry(vm.envAddress("ENS_PARENT_REGISTRY"));
        string memory label = vm.envString("ENS_IDENTITY_LABEL");
        bytes32 node = vm.envBytes32("ENS_IDENTITY_NAMEHASH");
        uint256 id = uint256(keccak256(bytes(label)));
        address sender = vm.envAddress("ENS_IDENTITY_OWNER");
        require(parent.getOwner(id) == sender, "Sender must control identity");
        require(parent.hasRoles(id, 1 << 20, sender), "SET_SUBREGISTRY required");
        require(parent.getSubregistry(label) == address(0), "Existing child registry preserved");
        vm.startBroadcast(sender);
        registry = new WayleaveAgentRegistry(parent, label, node);
        parent.setSubregistry(id, address(registry));
        vm.stopBroadcast();
    }
}
