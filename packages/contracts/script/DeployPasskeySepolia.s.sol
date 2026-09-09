// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;
import {Script, console2} from "forge-std/Script.sol";
import {KernelFactory} from "kernel-v4/KernelFactory.sol";
import {PasskeyAccountFactory} from "../src/PasskeyAccountFactory.sol";
import {WebAuthnValidator} from "../src/vendor/zerodev/WebAuthnValidator.sol";
import {IIdentityAdapter} from "../src/interfaces/IAccountRegistry.sol";

/// @notice Deploy infrastructure only, reusing a verified upstream Kernel factory.
/// @dev Does not generate a passkey, create a user account, or enable ENS automatically.
contract DeployPasskeySepolia is Script {
    function run() external {
        require(block.chainid == 11155111, "Sepolia only");
        KernelFactory kernelFactory = KernelFactory(vm.envAddress("MANDATE_KERNEL_FACTORY"));
        require(address(kernelFactory).code.length > 0, "Missing Kernel factory");
        // ENS adapters are bound separately after deployment and require namespace registrar permission.
        IIdentityAdapter adapter = IIdentityAdapter(vm.envOr("MANDATE_PASSKEY_IDENTITY_ADAPTER", address(0)));
        if (address(adapter) != address(0)) require(address(adapter).code.length > 0, "Missing ENS adapter");
        vm.startBroadcast();
        WebAuthnValidator validator = new WebAuthnValidator();
        PasskeyAccountFactory factory = new PasskeyAccountFactory(adapter, kernelFactory, validator);
        vm.stopBroadcast();
        console2.log("Kernel factory", address(kernelFactory));
        console2.log("Passkey validator", address(validator));
        console2.log("Passkey account factory", address(factory));
        console2.log("Identity adapter (requires binding and registrar permission)", address(adapter));
    }
}
