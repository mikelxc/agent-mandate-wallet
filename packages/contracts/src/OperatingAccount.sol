// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAccountRegistry} from "./interfaces/IAccountRegistry.sol";

/// @notice Narrow payment account. No arbitrary calls, approvals, or ERC-4337 claims.
contract OperatingAccount is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Mandate {
        address agent;
        address asset;
        address recipient;
        uint256 perPayment;
        uint256 budget;
        uint256 spent;
        uint64 expiry;
        uint256 epoch;
        bool revoked;
    }
    IAccountRegistry public immutable registry;
    uint256 public immutable tokenId;
    uint256 public nextMandateId;
    mapping(uint256 => Mandate) public mandates;
    // Business references are unique across all mandates on this account.
    mapping(bytes32 => bool) public completedRequests;
    error Unauthorized();
    error InvalidPolicy();
    error PolicyDenied();
    error DuplicateRequest();
    event MandateGranted(uint256 indexed mandateId, address indexed agent, uint256 epoch);
    event MandateRevoked(uint256 indexed mandateId);
    event PaymentExecuted(
        bytes32 indexed requestId, uint256 indexed mandateId, address indexed asset, address recipient, uint256 amount
    );
    event OwnerWithdrawal(address indexed asset, address indexed recipient, uint256 amount);

    constructor(IAccountRegistry registry_, uint256 tokenId_) {
        registry = registry_;
        tokenId = tokenId_;
    }
    modifier onlyOwner() {
        if (msg.sender != registry.ownerOf(tokenId)) revert Unauthorized();
        _;
    }

    function grant(address agent, address asset, address recipient, uint256 perPayment, uint256 budget, uint64 expiry)
        external
        onlyOwner
        returns (uint256 id)
    {
        if (
            agent == address(0) || asset.code.length == 0 || recipient == address(0) || recipient == address(this)
                || perPayment == 0 || budget < perPayment || expiry <= block.timestamp
        ) revert InvalidPolicy();
        id = nextMandateId++;
        mandates[id] =
            Mandate(agent, asset, recipient, perPayment, budget, 0, expiry, registry.ownershipEpoch(tokenId), false);
        emit MandateGranted(id, agent, registry.ownershipEpoch(tokenId));
    }

    function revoke(uint256 id) external onlyOwner {
        mandates[id].revoked = true;
        emit MandateRevoked(id);
    }

    function pay(uint256 id, bytes32 requestId, address asset, address recipient, uint256 amount)
        external
        nonReentrant
    {
        Mandate storage m = mandates[id];
        if (msg.sender != m.agent) revert Unauthorized();
        if (
            m.revoked || m.epoch != registry.ownershipEpoch(tokenId) || block.timestamp >= m.expiry || asset != m.asset
                || recipient != m.recipient || amount == 0 || amount > m.perPayment || amount > m.budget - m.spent
        ) revert PolicyDenied();
        if (requestId == bytes32(0) || completedRequests[requestId]) revert DuplicateRequest();
        completedRequests[requestId] = true;
        m.spent += amount;
        IERC20(asset).safeTransfer(recipient, amount);
        emit PaymentExecuted(requestId, id, asset, recipient, amount);
    }

    function withdraw(address asset, address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidPolicy();
        IERC20(asset).safeTransfer(recipient, amount);
        emit OwnerWithdrawal(asset, recipient, amount);
    }
}
