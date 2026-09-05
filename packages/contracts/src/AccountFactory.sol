// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {OperatingAccount} from "./OperatingAccount.sol";
import {IAccountRegistry, IIdentityAdapter} from "./interfaces/IAccountRegistry.sol";

/// @notice Factory + ERC-721 ownership registry, with explicit two-party handover.
contract AccountFactory is ERC721, ReentrancyGuard {
    IIdentityAdapter public immutable identityAdapter;
    uint256 public nextTokenId = 1;
    mapping(uint256 => address) public accountOf;
    mapping(uint256 => uint256) public ownershipEpoch;
    mapping(uint256 => address) public pendingOwner;
    mapping(uint256 => string) public labelOf;
    mapping(bytes32 => bool) public registeredLabels;
    mapping(address => bool) public isOperatingAccount;
    error InvalidLabel();
    error LabelTaken();
    error Unauthorized();
    error UseHandover();
    error InvalidOwner();
    event AccountCreated(
        uint256 indexed tokenId, address indexed owner, address indexed account, string label, bytes32 identityNode
    );
    event HandoverProposed(uint256 indexed tokenId, address indexed recipient);
    event OwnershipChanged(uint256 indexed tokenId, uint256 epoch);

    constructor(IIdentityAdapter adapter) ERC721("Mandate Operating Accounts", "MANDATE") {
        identityAdapter = adapter;
    }

    function createAccount(string calldata label) external nonReentrant returns (uint256 id, address account) {
        bytes memory value = bytes(label);
        if (value.length < 3 || value.length > 32) revert InvalidLabel();
        for (uint256 i; i < value.length; ++i) {
            bytes1 c = value[i];
            if (!((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || (c == 0x2d && i > 0 && i < value.length - 1)))
            revert InvalidLabel();
        }
        bytes32 labelHash = keccak256(value);
        if (registeredLabels[labelHash]) revert LabelTaken();
        registeredLabels[labelHash] = true;
        id = nextTokenId++;
        account = address(new OperatingAccount{salt: bytes32(id)}(IAccountRegistry(address(this)), id));
        accountOf[id] = account;
        isOperatingAccount[account] = true;
        labelOf[id] = label;
        ownershipEpoch[id] = 1;
        _safeMint(msg.sender, id);
        bytes32 node;
        if (address(identityAdapter) != address(0)) node = identityAdapter.register(label, account);
        emit AccountCreated(id, msg.sender, account, label, node);
    }

    function proposeHandover(uint256 id, address recipient) external {
        if (msg.sender != ownerOf(id)) revert Unauthorized();
        // Disallow accounts from this factory as owners to prevent local ownership cycles.
        if (
            recipient == address(0) || recipient == msg.sender || recipient == address(this)
                || isOperatingAccount[recipient]
        ) revert InvalidOwner();
        pendingOwner[id] = recipient;
        emit HandoverProposed(id, recipient);
    }

    function cancelHandover(uint256 id) external {
        if (msg.sender != ownerOf(id)) revert Unauthorized();
        delete pendingOwner[id];
    }

    function acceptHandover(uint256 id) external nonReentrant {
        if (pendingOwner[id] != msg.sender) revert Unauthorized();
        address previous = ownerOf(id);
        delete pendingOwner[id];
        ++ownershipEpoch[id];
        _safeTransfer(previous, msg.sender, id, "");
        emit OwnershipChanged(id, ownershipEpoch[id]);
    }

    function transferFrom(address, address, uint256) public pure override {
        revert UseHandover();
    }

    function approve(address, uint256) public pure override {
        revert UseHandover();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert UseHandover();
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return string.concat(
            "data:application/json;base64,",
            Base64.encode(
                bytes(
                    string.concat(
                        '{"name":"',
                        labelOf[id],
                        '","description":"Mandate operating account","account":"',
                        Strings.toHexString(accountOf[id]),
                        '","chain_id":',
                        Strings.toString(block.chainid),
                        "}"
                    )
                )
            )
        );
    }
}
