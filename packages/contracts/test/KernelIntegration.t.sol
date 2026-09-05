// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;
import {Test} from "forge-std/Test.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {KernelUUPS} from "kernel-v4/KernelUUPS.sol";
import {KernelImmutableECDSA} from "kernel-v4/KernelImmutableECDSA.sol";
import {KernelFactory} from "kernel-v4/KernelFactory.sol";
import {Kernel} from "kernel-v4/Kernel.sol";
import {ValidationId} from "kernel-v4/types/Types.sol";
import {NFTOwnerValidator} from "../src/NFTOwnerValidator.sol";
import {KernelAccountFactory} from "../src/KernelAccountFactory.sol";
import {IIdentityAdapter} from "../src/interfaces/IAccountRegistry.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @dev Test-only owner wallet: its calls preserve the token owner's caller context.
contract SetupOwnerWallet {
    function onERC721Received(address,address,uint256,bytes calldata) external pure returns (bytes4) { return 0x150b7a02; }
    function setup(KernelAccountFactory registry, MockUSDC token, string calldata label, uint256 id, address predicted) external {
        registry.createAccountChecked(label, id);
        token.approve(predicted, 8e6);
    }
}

contract KernelIntegrationTest is Test {
    EntryPoint ep;
    KernelAccountFactory registry;
    NFTOwnerValidator validator;
    Kernel account;
    MockUSDC token;
    uint256 constant OWNER_KEY = 0xA11CE;
    uint256 constant BOB_KEY = 0xB0B;
    address owner;
    address bob;
    address vendor = address(0xBEEF);
    function setUp() public {
        owner = vm.addr(OWNER_KEY); bob = vm.addr(BOB_KEY);
        ep = new EntryPoint();
        KernelFactory kf = new KernelFactory(new KernelUUPS(IEntryPoint(address(ep))), new KernelImmutableECDSA(IEntryPoint(address(ep))));
        validator = new NFTOwnerValidator();
        registry = new KernelAccountFactory(IIdentityAdapter(address(0)), kf, validator);
        vm.prank(owner); (,address a) = registry.createAccount("kernel-research"); account = Kernel(payable(a));
        vm.deal(a, 1 ether);
        token = new MockUSDC(); token.mint(owner, 100e6);
        vm.prank(owner); token.approve(a, 8e6);
    }
    function sig(uint256 key, bytes32 digest) internal pure returns (bytes memory) { (uint8 v,bytes32 r,bytes32 s)=vm.sign(key,digest);return abi.encodePacked(r,s,v); }
    function op(uint256 nonce, uint256 amount) internal view returns(PackedUserOperation memory u) {
        u.sender=address(account); u.nonce=nonce;
        u.callData=abi.encodeCall(account.execute,(bytes32(0),abi.encodePacked(address(token),uint256(0),abi.encodeCall(token.transferFrom,(owner,vendor,amount)))));
        u.accountGasLimits=bytes32((uint256(700_000)<<128)|uint256(700_000));u.preVerificationGas=60_000;
        u.gasFees=bytes32((uint256(1 gwei)<<128)|uint256(1 gwei));
        u.signature=sig(OWNER_KEY,validator.authorizationDigest(address(account),ep.getUserOpHash(u)));
    }
    function send(PackedUserOperation memory u) internal { PackedUserOperation[] memory ops=new PackedUserOperation[](1);ops[0]=u;vm.prank(owner, owner);ep.handleOps(ops,payable(address(0xCAFE))); }
    function testRealEntryPoint09OwnerBalanceSpend() public {
        assertEq(ValidationId.unwrap(account.root()),bytes21(abi.encodePacked(bytes1(0x01),address(validator))));
        send(op(0,3e6));
        assertEq(token.balanceOf(owner),97e6);assertEq(token.balanceOf(vendor),3e6);assertEq(token.balanceOf(address(account)),0);
        assertEq(token.allowance(owner,address(account)),5e6);
    }
    function testTwoValidatedOpsCannotExceedTokenAllowance() public {
        PackedUserOperation[] memory ops=new PackedUserOperation[](2);ops[0]=op(0,5e6);ops[1]=op(1,5e6);
        vm.prank(owner, owner);ep.handleOps(ops,payable(address(0xCAFE)));
        assertEq(token.balanceOf(vendor),5e6);assertEq(token.allowance(owner,address(account)),3e6);
    }
    function testReplayRejectedByEntryPoint() public {PackedUserOperation memory u=op(0,3e6);send(u);vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector,0,"AA25 invalid account nonce"));send(u);}
    function testRevokeAllowance() public {vm.prank(owner);token.approve(address(account),0);send(op(0,3e6));assertEq(token.balanceOf(vendor),0);}
    function testWrongSignerRejectedByEntryPoint() public {
        PackedUserOperation memory u=op(0,3e6);u.signature=sig(BOB_KEY,validator.authorizationDigest(address(account),ep.getUserOpHash(u)));
        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector,0,"AA24 signature error"));send(u);
    }
    function testOldUserOpCannotSurviveRoundTripOwnership() public {
        PackedUserOperation memory u=op(0,3e6);
        vm.prank(owner);registry.proposeHandover(1,bob);vm.prank(bob);registry.acceptHandover(1);
        vm.prank(bob);registry.proposeHandover(1,owner);vm.prank(owner);registry.acceptHandover(1);
        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector,0,"AA24 signature error"));send(u);
    }
    /// @dev Deliberately documents the standing-allowance risk; NFT transfer does not clear external token storage.
    function testStandingAllowanceSurvivesNFTTransfer() public {
        vm.prank(owner);registry.proposeHandover(1,bob);vm.prank(bob);registry.acceptHandover(1);
        PackedUserOperation memory u=op(0,3e6);u.signature=sig(BOB_KEY,validator.authorizationDigest(address(account),ep.getUserOpHash(u)));
        send(u);assertEq(token.balanceOf(vendor),3e6);
    }
    function testFactoryPredictionMatchesDeployment() public {
        (uint256 id,address predicted)=registry.nextAccountAddress();vm.prank(owner);(,address actual)=registry.createAccountChecked("second-account",id);assertEq(predicted,actual);
    }
    function testStalePredictionRevertsInsteadOfApprovingAnotherAccount() public {
        (uint256 id,)=registry.nextAccountAddress();vm.prank(bob);registry.createAccount("other-account");
        vm.prank(owner);vm.expectRevert("Account prediction changed");registry.createAccountChecked("second-account",id);
    }
    function testOwnerWalletBatchesDeploymentAndApproval() public {
        SetupOwnerWallet wallet = new SetupOwnerWallet();
        (uint256 id,address predicted)=registry.nextAccountAddress();
        wallet.setup(registry,token,"batched-wallet",id,predicted);
        assertEq(registry.ownerOf(id),address(wallet));
        assertEq(registry.accountOf(id),predicted);
        assertEq(token.allowance(address(wallet),predicted),8e6);
        assertEq(token.allowance(owner,predicted),0);
    }
    function testStaleBatchDoesNotLeaveApproval() public {
        SetupOwnerWallet wallet = new SetupOwnerWallet();
        (uint256 id,address predicted)=registry.nextAccountAddress();
        vm.prank(owner); registry.createAccount("competing-mint");
        vm.expectRevert("Account prediction changed");
        wallet.setup(registry,token,"batched-wallet",id,predicted);
        assertEq(token.allowance(address(wallet),predicted),0);
    }
}
