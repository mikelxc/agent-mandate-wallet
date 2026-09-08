// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {Script, console2} from "forge-std/Script.sol";
import {KernelFactory} from "kernel-v4/KernelFactory.sol";
import {ENSV2IdentityAdapter, IENSV2Registry} from "../src/ENSV2IdentityAdapter.sol";
import {KernelAccountFactory} from "../src/KernelAccountFactory.sol";
import {NFTOwnerValidator} from "../src/NFTOwnerValidator.sol";

interface IVerifiableFactory {
    function deployProxy(address implementation, uint256 salt, bytes calldata data) external returns (address proxy);
    function verifyContract(address proxy) external view returns (address implementation);
}

interface IETHRegistry {
    function getOwner(uint256 anyId) external view returns (address);
    function getExpiry(uint256 anyId) external view returns (uint64);
    function getResolver(string calldata label) external view returns (address);
    function getSubregistry(string calldata label) external view returns (address);
    function setResolver(uint256 anyId, address resolver) external;
    function setSubregistry(uint256 anyId, address subregistry) external;
}

interface IUserRegistry is IENSV2Registry {
    function setParent(address parent, string calldata label) external;
    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool);
    function hasRootRoles(uint256 roleBitmap, address account) external view returns (bool);
}

interface IPermissionedResolver {
    struct Grant {
        address account;
        uint256 roleBitmap;
    }

    function initialize(Grant[] calldata grants, bytes[] calldata calls) external;
    function setAddress(bytes calldata name, uint256 coinType, bytes calldata addressBytes) external;
}

/// @notice Builds the live wayleave.eth resolver, subregistry, adapter, and product factory.
/// @dev Grants the adapter only ROLE_REGISTRAR; parent ownership remains with the operator.
contract DeployWayleaveSepolia is Script {
    address constant OWNER = 0x96B0D15128748cE191B79c75560Ed93695788865;
    address constant KERNEL_FACTORY = 0x06f085A6c6E4f12Ea1044B708412168674e6faD4;
    address constant NFT_OWNER_VALIDATOR = 0xe4cB1515BD7aC3D43f979392517EB35964A7b7cc;
    address constant ETH_REGISTRY = 0x1D78834d97c1D7b1A38c1deDBD1a287cFEd3971e;
    address constant VERIFIABLE_FACTORY = 0x894bc9cC8ff1ad96B8a288C86A8C71D662C07780;
    address constant PERMISSIONED_RESOLVER_IMPL = 0xa9d3814AB151BF6E37A427432795371a8361614e;
    address constant USER_REGISTRY_IMPL = 0x47B442d0CF617c41CAbAFf5f02f44DD1e5f72546;
    bytes32 constant WAYLEAVE_PARENT_NODE = 0x195be2c643321f60b733c3e17ceb172a918b6da3a8b2b1586d17100aea3655d8;
    string constant LABEL = "wayleave";
    bytes constant DNS_NAME = hex"087761796c656176650365746800";

    uint256 constant ROLE_REGISTRAR = 1 << 0;
    uint256 constant ROLE_REGISTRAR_ADMIN = ROLE_REGISTRAR << 128;
    uint256 constant ROLE_SET_PARENT = 1 << 8;
    uint256 constant ROLE_SET_ADDRESS = 1 << 0;

    function run() external {
        require(block.chainid == 11155111, "Sepolia only");
        require(KERNEL_FACTORY.code.length > 0, "Missing Kernel factory");
        require(NFT_OWNER_VALIDATOR.code.length > 0, "Missing NFT validator");
        require(ETH_REGISTRY.code.length > 0, "Missing ETH registry");
        require(VERIFIABLE_FACTORY.code.length > 0, "Missing verifiable factory");
        require(PERMISSIONED_RESOLVER_IMPL.code.length > 0, "Missing resolver implementation");
        require(USER_REGISTRY_IMPL.code.length > 0, "Missing registry implementation");

        uint256 labelhash = uint256(keccak256(bytes(LABEL)));
        IETHRegistry ethRegistry = IETHRegistry(ETH_REGISTRY);
        require(ethRegistry.getOwner(labelhash) == OWNER, "Unexpected wayleave.eth owner");
        uint64 parentExpiry = ethRegistry.getExpiry(labelhash);
        require(parentExpiry > block.timestamp, "Expired parent");
        require(ethRegistry.getResolver(LABEL) == address(0), "Resolver already configured");
        require(ethRegistry.getSubregistry(LABEL) == address(0), "Subregistry already configured");

        uint256 resolverSalt = uint256(keccak256(abi.encode(keccak256("OwnedResolver"), OWNER, uint256(0))));
        uint256 registrySalt =
            uint256(keccak256(abi.encode(keccak256("UserRegistry"), WAYLEAVE_PARENT_NODE, uint256(0))));
        IPermissionedResolver.Grant[] memory resolverGrants = new IPermissionedResolver.Grant[](1);
        resolverGrants[0] = IPermissionedResolver.Grant({account: OWNER, roleBitmap: ROLE_SET_ADDRESS});
        bytes[] memory resolverCalls = new bytes[](0);
        bytes memory resolverInit = abi.encodeCall(IPermissionedResolver.initialize, (resolverGrants, resolverCalls));
        IPermissionedResolver.Grant[] memory registryGrants = new IPermissionedResolver.Grant[](1);
        registryGrants[0] = IPermissionedResolver.Grant({
            account: OWNER, roleBitmap: ROLE_SET_PARENT | ROLE_REGISTRAR_ADMIN
        });
        bytes memory registryInit = abi.encodeWithSignature("initialize((address,uint256)[])", registryGrants);

        vm.startBroadcast();
        address resolver = IVerifiableFactory(VERIFIABLE_FACTORY).deployProxy(
            PERMISSIONED_RESOLVER_IMPL, resolverSalt, resolverInit
        );
        address userRegistry =
            IVerifiableFactory(VERIFIABLE_FACTORY).deployProxy(USER_REGISTRY_IMPL, registrySalt, registryInit);
        ethRegistry.setResolver(labelhash, resolver);
        ethRegistry.setSubregistry(labelhash, userRegistry);
        IUserRegistry(userRegistry).setParent(ETH_REGISTRY, LABEL);
        IPermissionedResolver(resolver).setAddress(DNS_NAME, 60, abi.encodePacked(OWNER));

        ENSV2IdentityAdapter adapter = new ENSV2IdentityAdapter(
            IENSV2Registry(userRegistry), WAYLEAVE_PARENT_NODE, parentExpiry
        );
        KernelAccountFactory registry = new KernelAccountFactory(
            adapter, KernelFactory(KERNEL_FACTORY), NFTOwnerValidator(NFT_OWNER_VALIDATOR)
        );
        adapter.bindFactory(address(registry));
        IUserRegistry(userRegistry).grantRootRoles(ROLE_REGISTRAR, address(adapter));
        vm.stopBroadcast();

        console2.log("Wayleave ENSv2 UserRegistry", userRegistry);
        console2.log("Wayleave ENSv2 resolver", resolver);
        console2.log("Wayleave identity adapter", address(adapter));
        console2.log("Wayleave product factory", address(registry));
        console2.log("Wayleave parent expiry", parentExpiry);

        require(
            IVerifiableFactory(VERIFIABLE_FACTORY).verifyContract(resolver) == PERMISSIONED_RESOLVER_IMPL,
            "Unverified resolver proxy"
        );
        require(
            IVerifiableFactory(VERIFIABLE_FACTORY).verifyContract(userRegistry) == USER_REGISTRY_IMPL,
            "Unverified registry proxy"
        );
        require(IUserRegistry(userRegistry).hasRootRoles(ROLE_REGISTRAR, address(adapter)), "Missing registrar role");
    }
}
