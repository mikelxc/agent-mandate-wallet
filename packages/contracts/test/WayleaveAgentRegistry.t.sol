// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {WayleaveAgentRegistry, IWayleaveParentRegistry} from "../src/WayleaveAgentRegistry.sol";

contract IdentityParent is IWayleaveParentRegistry {
    address public owner;
    uint256 public resource = 1;
    uint256 public token = 1;
    uint64 public expiry;

    constructor(address o) {
        owner = o;
        expiry = uint64(block.timestamp + 10000);
    }

    function getOwner(uint256) external view returns (address) {
        return block.timestamp < expiry ? owner : address(0);
    }

    function getTokenId(uint256) external view returns (uint256) {
        return token;
    }

    function getResource(uint256) external view returns (uint256) {
        return resource;
    }

    function getExpiry(uint256) external view returns (uint64) {
        return expiry;
    }

    function change(address o, uint256 r) external {
        owner = o;
        resource = r;
        token++;
    }
}

contract WayleaveAgentRegistryTest is Test {
    IdentityParent parent;
    WayleaveAgentRegistry registry;
    address owner = address(11);
    address key = address(22);

    function setUp() public {
        parent = new IdentityParent(owner);
        registry = new WayleaveAgentRegistry(parent, "desk", keccak256("desk.eth"));
    }

    function enroll() internal {
        vm.prank(owner);
        registry.enroll("codex", key, uint64(block.timestamp + 100), 3);
    }

    function testOwnerOnlyEnrollmentAndRemoval() public {
        vm.expectRevert(WayleaveAgentRegistry.Unauthorized.selector);
        registry.enroll("codex", key, uint64(block.timestamp + 100), 1);
        enroll();
        (address k, uint64 g,, uint8 scopes) = registry.getAgent("codex");
        assertEq(k, key);
        assertEq(g, 1);
        assertEq(scopes, 3);
        vm.prank(key);
        vm.expectRevert(WayleaveAgentRegistry.Unauthorized.selector);
        registry.remove("codex");
        vm.prank(owner);
        registry.remove("codex");
        (k, g,, scopes) = registry.getAgent("codex");
        assertEq(k, address(0));
        assertEq(g, 2);
        assertEq(scopes, 0);
    }

    function testRotationExpiryAndGeneration() public {
        enroll();
        enroll();
        (, uint64 g,,) = registry.getAgent("codex");
        assertEq(g, 2);
        vm.warp(block.timestamp + 100);
        (address k,,,) = registry.getAgent("codex");
        assertEq(k, address(0));
    }

    function testTransferAndReregistrationInvalidatesMembership() public {
        enroll();
        parent.change(address(33), 1);
        (address k,,,) = registry.getAgent("codex");
        assertEq(k, address(0));
        parent.change(owner, 2);
        (k,,,) = registry.getAgent("codex");
        assertEq(k, address(0));
        vm.prank(owner);
        vm.expectRevert(WayleaveAgentRegistry.Unauthorized.selector);
        registry.remove("codex");
    }

    function testNoExcessScopeOrParentLifetime() public {
        vm.startPrank(owner);
        vm.expectRevert(WayleaveAgentRegistry.InvalidEnrollment.selector);
        registry.enroll("codex", key, uint64(block.timestamp + 100), 4);
        vm.expectRevert(WayleaveAgentRegistry.InvalidEnrollment.selector);
        registry.enroll("codex", key, uint64(block.timestamp + 10001), 1);
        vm.stopPrank();
    }
}
