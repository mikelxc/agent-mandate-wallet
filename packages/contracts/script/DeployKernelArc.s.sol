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
interface IArcUsdc { function decimals() external view returns (uint8); }
interface ICircleDomain { function localDomain() external view returns (uint32); }

/// @notice Authorized Arc TESTNET deployment only. Uses canonical Circle USDC, never deploys a mock.
contract DeployKernelArc is Script {
    address constant DEPLOYER = 0x96B0D15128748cE191B79c75560Ed93695788865;
    address constant EP = 0x433709009B8330FDa32311DF1C2AFA402eD8D009;
    address constant USDC = 0x3600000000000000000000000000000000000000;
    bytes32 constant EP_CODE_HASH = 0x4912531cbb1316092e1c25164d8fd78bdb94374d990be9575246e6d98e38a25a;
    function run() external {
        require(block.chainid == 5042002, "Arc Testnet only");
        require(DEPLOYER.balance >= 1 ether, "At least 1 native USDC required");
        require(EP.codehash == EP_CODE_HASH, "Unexpected EntryPoint 0.9 runtime");
        require(address(IEntryPoint(EP).senderCreator()) == 0x0A630a99Df908A81115A3022927Be82f9299987e, "Unexpected sender creator");
        require(IArcUsdc(USDC).decimals() == 6, "Unexpected USDC decimals");
        require(ICircleDomain(0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275).localDomain() == 26, "Unexpected Circle domain");
        vm.startBroadcast(DEPLOYER);
        KernelUUPS implementation = new KernelUUPS(IEntryPoint(EP));
        KernelImmutableECDSA fallbackImplementation = new KernelImmutableECDSA(IEntryPoint(EP));
        KernelFactory kernelFactory = new KernelFactory(implementation, fallbackImplementation);
        NFTOwnerValidator validator = new NFTOwnerValidator();
        // ENS identity stays on Sepolia and is associated through chain-bound proofs.
        KernelAccountFactory registry = new KernelAccountFactory(IIdentityAdapter(address(0)), kernelFactory, validator);
        (uint256 tokenId, address account) = registry.createAccount("arc-research");
        vm.stopBroadcast();
        require(registry.ownerOf(tokenId) == DEPLOYER && registry.accountOf(tokenId) == account, "Account verification failed");
        console2.log("EntryPoint 0.9", EP);
        console2.log("Circle USDC", USDC);
        console2.log("Kernel implementation", address(implementation));
        console2.log("Kernel fallback", address(fallbackImplementation));
        console2.log("Kernel factory", address(kernelFactory));
        console2.log("NFT owner validator", address(validator));
        console2.log("Account registry", address(registry));
        console2.log("Initial NFAT account", account);
        console2.log("NFAT token ID", tokenId);
    }
}
