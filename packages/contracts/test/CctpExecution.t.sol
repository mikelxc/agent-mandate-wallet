// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;
import {KernelIntegrationTest} from "./KernelIntegration.t.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @dev Deliberate local simulation, not a Circle deployment.
contract SimulatedCctpMessenger {
    bool public fail;
    uint256 public burned;
    uint32 public domain;
    bytes32 public recipient;
    function setFail(bool value) external { fail = value; }
    function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 finality) external {
        require(!fail, "simulated burn failure");
        require(destinationDomain == 0 && destinationCaller == bytes32(0) && maxFee < amount && finality == 2000, "invalid route");
        MockUSDC(burnToken).transferFrom(msg.sender,address(this),amount);
        burned += amount; domain = destinationDomain; recipient = mintRecipient;
    }
}
contract CctpExecutionTest is KernelIntegrationTest {
    struct Call { address target; uint256 value; bytes callData; }
    SimulatedCctpMessenger messenger;

    function cctpOp() internal view returns (PackedUserOperation memory u) {
        u=op(0,3e6);
        Call[] memory calls=new Call[](5);
        calls[0]=Call(address(token),0,abi.encodeCall(token.transferFrom,(owner,address(account),3e6)));
        calls[1]=Call(address(token),0,abi.encodeCall(token.approve,(address(messenger),0)));
        calls[2]=Call(address(token),0,abi.encodeCall(token.approve,(address(messenger),3e6)));
        calls[3]=Call(address(messenger),0,abi.encodeCall(messenger.depositForBurn,(3e6,0,bytes32(uint256(uint160(vendor))),address(token),bytes32(0),1000,2000)));
        calls[4]=Call(address(token),0,abi.encodeCall(token.approve,(address(messenger),0)));
        u.callData=abi.encodeCall(account.execute,(bytes32(uint256(1)<<248),abi.encode(calls)));
        u.signature=sig(OWNER_KEY,validator.authorizationDigest(address(account),ep.getUserOpHash(u)));
    }
    function testCctpAtomicOwnerPullBurnAndExactApproval() public {
        messenger = new SimulatedCctpMessenger();
        send(cctpOp());
        assertEq(messenger.burned(),3e6);
        assertEq(messenger.recipient(),bytes32(uint256(uint160(vendor))));
        assertEq(token.balanceOf(owner),97e6);
        assertEq(token.balanceOf(address(account)),0);
        assertEq(token.allowance(address(account),address(messenger)),0);
        assertEq(token.allowance(owner,address(account)),5e6);
    }
    function testCctpBurnFailureRollsBackOwnerPullAndApprovals() public {
        messenger = new SimulatedCctpMessenger();
        messenger.setFail(true);
        send(cctpOp());
        assertEq(messenger.burned(),0);
        assertEq(token.balanceOf(owner),100e6);
        assertEq(token.allowance(owner,address(account)),8e6);
        assertEq(token.allowance(address(account),address(messenger)),0);
    }
}
