// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Script, console2} from "forge-std/Script.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {IIdentityAdapter} from "../src/interfaces/IAccountRegistry.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Deploy the existing reference prototype, not the planned Kernel account stack.
contract DeploySepolia is Script {
    function run() external {
        require(block.chainid == 11155111, "Sepolia only");
        address adapter = vm.envOr("ENS_IDENTITY_ADAPTER", address(0));
        if (adapter != address(0)) require(adapter.code.length > 0, "Missing ENS adapter code");
        vm.startBroadcast();
        AccountFactory factory = new AccountFactory(IIdentityAdapter(adapter));
        MockUSDC token = new MockUSDC();
        vm.stopBroadcast();
        console2.log("Reference factory", address(factory));
        console2.log("Unrestricted mintable demo token (not Circle USDC)", address(token));
        console2.log("ENS adapter (zero means disabled)", adapter);
    }
}
