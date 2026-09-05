// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;
import {Script, console2} from "forge-std/Script.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {KernelUUPS} from "kernel-v4/KernelUUPS.sol";
import {KernelImmutableECDSA} from "kernel-v4/KernelImmutableECDSA.sol";
import {KernelFactory} from "kernel-v4/KernelFactory.sol";
import {NFTOwnerValidator} from "../src/NFTOwnerValidator.sol";
import {KernelAccountFactory} from "../src/KernelAccountFactory.sol";
import {IIdentityAdapter} from "../src/interfaces/IAccountRegistry.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
contract DeployKernelSepolia is Script {
    address constant EP = 0x433709009B8330FDa32311DF1C2AFA402eD8D009;
    function run() external {
        require(block.chainid == 11155111, "Sepolia only");
        require(EP.code.length > 0, "Missing EntryPoint");
        require(address(IEntryPoint(EP).senderCreator()) == 0x0A630a99Df908A81115A3022927Be82f9299987e, "Unexpected EntryPoint");
        vm.startBroadcast();
        KernelUUPS implementation = new KernelUUPS(IEntryPoint(EP));
        KernelImmutableECDSA fallbackImplementation = new KernelImmutableECDSA(IEntryPoint(EP));
        KernelFactory kernelFactory = new KernelFactory(implementation, fallbackImplementation);
        NFTOwnerValidator validator = new NFTOwnerValidator();
        KernelAccountFactory registry = new KernelAccountFactory(IIdentityAdapter(address(0)), kernelFactory, validator);
        MockUSDC token = new MockUSDC();
        (,address account)=registry.createAccount("sepolia-research");
        vm.stopBroadcast();
        console2.log("EntryPoint 0.9",EP);
        console2.log("Kernel implementation",address(implementation));
        console2.log("Kernel factory",address(kernelFactory));
        console2.log("NFT owner validator",address(validator));
        console2.log("Account registry",address(registry));
        console2.log("Demo token",address(token));
        console2.log("Demo account",account);
    }
}
