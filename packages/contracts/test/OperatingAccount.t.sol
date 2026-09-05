// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {OperatingAccount} from "../src/OperatingAccount.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IIdentityAdapter} from "../src/interfaces/IAccountRegistry.sol";

contract OperatingAccountTest is Test {
    AccountFactory factory;
    OperatingAccount account;
    MockUSDC token;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address agent = makeAddr("agent");
    address vendor = makeAddr("vendor");
    uint256 id;

    function setUp() public {
        factory = new AccountFactory(IIdentityAdapter(address(0)));
        token = new MockUSDC();
        vm.startPrank(alice);
        (, address deployed) = factory.createAccount("research");
        account = OperatingAccount(deployed);
        id = account.grant(agent, address(token), vendor, 5e6, 20e6, uint64(block.timestamp + 1 days));
        vm.stopPrank();
        token.mint(address(account), 100e6);
    }

    function payment(bytes32 request, address recipient, uint256 amount) internal {
        vm.prank(agent);
        account.pay(id, request, address(token), recipient, amount);
    }

    function testPaymentAndBudget() public {
        payment(bytes32(uint256(1)), vendor, 5e6);
        assertEq(token.balanceOf(vendor), 5e6);
        (,,,,, uint256 spent,,,) = account.mandates(id);
        assertEq(spent, 5e6);
    }

    function testWrongRecipient() public {
        vm.expectRevert(OperatingAccount.PolicyDenied.selector);
        payment(bytes32(uint256(1)), bob, 1e6);
    }

    function testWrongAsset() public {
        vm.prank(agent);
        vm.expectRevert(OperatingAccount.PolicyDenied.selector);
        account.pay(id, bytes32(uint256(1)), address(0x123), vendor, 1e6);
    }

    function testLimit() public {
        vm.expectRevert(OperatingAccount.PolicyDenied.selector);
        payment(bytes32(uint256(1)), vendor, 6e6);
    }

    function testCumulativeBudget() public {
        for (uint256 i = 1; i <= 4; i++) {
            payment(bytes32(i), vendor, 5e6);
        }
        vm.expectRevert(OperatingAccount.PolicyDenied.selector);
        payment(bytes32(uint256(5)), vendor, 1);
    }

    function testReplayAcrossMandates() public {
        payment(bytes32(uint256(1)), vendor, 1e6);
        vm.prank(alice);
        id = account.grant(agent, address(token), vendor, 5e6, 20e6, uint64(block.timestamp + 1 days));
        vm.expectRevert(OperatingAccount.DuplicateRequest.selector);
        payment(bytes32(uint256(1)), vendor, 1e6);
    }

    function testExpiryBoundary() public {
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(OperatingAccount.PolicyDenied.selector);
        payment(bytes32(uint256(1)), vendor, 1);
    }

    function testRevocation() public {
        vm.prank(alice);
        account.revoke(id);
        vm.expectRevert(OperatingAccount.PolicyDenied.selector);
        payment(bytes32(uint256(1)), vendor, 1);
    }

    function testTransferInvalidatesAndOldOwnerLosesAccess() public {
        vm.prank(alice);
        factory.proposeHandover(1, bob);
        vm.prank(bob);
        factory.acceptHandover(1);
        assertEq(factory.ownerOf(1), bob);
        assertEq(factory.ownershipEpoch(1), 2);
        vm.expectRevert(OperatingAccount.PolicyDenied.selector);
        payment(bytes32(uint256(1)), vendor, 1);
        vm.prank(alice);
        vm.expectRevert(OperatingAccount.Unauthorized.selector);
        account.withdraw(address(token), alice, 1);
    }

    function testRoundTripDoesNotReviveMandate() public {
        vm.prank(alice);
        factory.proposeHandover(1, bob);
        vm.prank(bob);
        factory.acceptHandover(1);
        vm.prank(bob);
        factory.proposeHandover(1, alice);
        vm.prank(alice);
        factory.acceptHandover(1);
        vm.expectRevert(OperatingAccount.PolicyDenied.selector);
        payment(bytes32(uint256(1)), vendor, 1);
    }

    function testRejectUnauthorizedGrant() public {
        vm.prank(agent);
        vm.expectRevert(OperatingAccount.Unauthorized.selector);
        account.grant(agent, address(token), vendor, 1, 1, uint64(block.timestamp + 1));
    }

    function testTokenRevertRollsBackRequestAndBudget() public {
        vm.prank(alice);
        account.withdraw(address(token), alice, 100e6);
        vm.expectRevert();
        payment(bytes32(uint256(1)), vendor, 1e6);
        assertFalse(account.completedRequests(bytes32(uint256(1))));
        (,,,,, uint256 spent,,,) = account.mandates(id);
        assertEq(spent, 0);
    }

    function testNoMarketplaceApprovals() public {
        vm.prank(alice);
        vm.expectRevert(AccountFactory.UseHandover.selector);
        factory.setApprovalForAll(bob, true);
    }

    function testNoDirectTransfer() public {
        vm.prank(alice);
        vm.expectRevert(AccountFactory.UseHandover.selector);
        factory.transferFrom(alice, bob, 1);
    }

    function testNoLocalOwnershipCycle() public {
        vm.prank(alice);
        vm.expectRevert(AccountFactory.InvalidOwner.selector);
        factory.proposeHandover(1, address(account));
    }

    function testLabelValidationAndUniqueness() public {
        vm.expectRevert(AccountFactory.InvalidLabel.selector);
        factory.createAccount("Bad.Name");
        vm.expectRevert(AccountFactory.LabelTaken.selector);
        factory.createAccount("research");
    }

    function testFuzzBudgetConservation(uint256 amount) public {
        amount = bound(amount, 1, 5e6);
        payment(bytes32(uint256(1)), vendor, amount);
        assertEq(token.balanceOf(address(account)) + token.balanceOf(vendor), 100e6);
    }
}
