// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Script, console2} from "forge-std/Script.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {IIdentityAdapter} from "../src/interfaces/IAccountRegistry.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract DeployLocal is Script {
    function run() external {
        require(block.chainid == 31337, "Local chain only");
        vm.startBroadcast();
        AccountFactory factory = new AccountFactory(IIdentityAdapter(address(0)));
        MockUSDC token = new MockUSDC();
        vm.stopBroadcast();
        console2.log("Factory", address(factory));
        console2.log("Demo USDC", address(token));
    }
}
