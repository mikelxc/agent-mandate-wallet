// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IWayleaveParentRegistry {
    function getOwner(uint256 anyId) external view returns (address);
    function getTokenId(uint256 anyId) external view returns (uint256);
    function getResource(uint256 anyId) external view returns (uint256);
    function getExpiry(uint256 anyId) external view returns (uint64);
}

/// @notice Owner-controlled ENSv2 child registry for portable agent authentication.
/// @dev Wayleave-specific schema; not an ENS standard or a spending permission.
/// No transfer, operator approvals, arbitrary execution, or agent-controlled writes.
contract WayleaveAgentRegistry {
    IWayleaveParentRegistry public immutable parentRegistry;
    uint256 public immutable parentId;
    uint256 public immutable parentResource;
    bytes32 public immutable parentNode;
    string public parentLabel;

    struct Agent {
        uint256 parentToken;
        address key;
        address controller;
        uint64 expiry;
        uint64 generation;
        uint8 scopes;
    }
    mapping(bytes32 => Agent) private agents;
    mapping(bytes32 => bytes32) private nodes;
    error Unauthorized();
    error InvalidEnrollment();
    event AgentEnrolled(
        bytes32 indexed labelHash,
        bytes32 indexed node,
        address indexed key,
        uint64 generation,
        uint64 expiry,
        uint8 scopes
    );
    event AgentRemoved(bytes32 indexed labelHash, uint64 generation);

    constructor(IWayleaveParentRegistry parent, string memory label, bytes32 node) {
        parentRegistry = parent;
        parentLabel = label;
        parentId = uint256(keccak256(bytes(label)));
        parentResource = parent.getResource(parentId);
        parentNode = node;
        if (node == bytes32(0) || parent.getOwner(parentId) == address(0)) revert InvalidEnrollment();
    }

    function controller() public view returns (address) {
        if (parentRegistry.getResource(parentId) != parentResource) return address(0);
        return parentRegistry.getOwner(parentId);
    }
    modifier onlyController() {
        if (msg.sender != controller() || msg.sender == address(0)) revert Unauthorized();
        _;
    }

    /// @notice Scope bit 1 = read; bit 2 = propose_payment. Neither authorizes payment.
    function enroll(string calldata label, address key, uint64 expiry, uint8 scopes) external onlyController {
        bytes memory value = bytes(label);
        if (
            value.length == 0 || value.length > 63 || key == address(0) || expiry <= block.timestamp
                || expiry > parentRegistry.getExpiry(parentId) || scopes == 0 || scopes > 3
        ) revert InvalidEnrollment();
        for (uint256 i; i < value.length; i++) {
            bytes1 c = value[i];
            if (!((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39)
                        || (c == 0x2d && i != 0 && i != value.length - 1))) revert InvalidEnrollment();
        }
        bytes32 hash = keccak256(value);
        uint64 generation = agents[hash].generation + 1;
        agents[hash] = Agent(parentRegistry.getTokenId(parentId), key, msg.sender, expiry, generation, scopes);
        bytes32 node = keccak256(abi.encodePacked(parentNode, hash));
        nodes[node] = hash;
        emit AgentEnrolled(hash, node, key, generation, expiry, scopes);
    }

    function remove(string calldata label) external onlyController {
        bytes32 hash = keccak256(bytes(label));
        uint64 generation = agents[hash].generation + 1;
        agents[hash] = Agent(parentRegistry.getTokenId(parentId), address(0), msg.sender, 0, generation, 0);
        emit AgentRemoved(hash, generation);
    }

    function getAgent(string calldata label)
        public
        view
        returns (address key, uint64 generation, uint64 expiry, uint8 scopes)
    {
        Agent memory a = agents[keccak256(bytes(label))];
        if (
            a.parentToken != parentRegistry.getTokenId(parentId) || a.expiry <= block.timestamp
                || a.controller != controller() || a.controller == address(0)
        ) return (address(0), a.generation, a.expiry, 0);
        return (a.key, a.generation, a.expiry, a.scopes);
    }

    function schemaVersion() external pure returns (uint256) {
        return 1;
    }

    function getParent() external view returns (address, string memory) {
        return (address(parentRegistry), parentLabel);
    }

    function getSubregistry(string calldata) external pure returns (address) {
        return address(0);
    }

    function getResolver(string calldata label) external view returns (address) {
        (address key,,,) = getAgent(label);
        return key == address(0) ? address(0) : address(this);
    }

    function addr(bytes32 node) external view returns (address) {
        Agent memory a = agents[nodes[node]];
        return a.parentToken == parentRegistry.getTokenId(parentId) && a.expiry > block.timestamp
                && a.controller == controller()
            ? a.key
            : address(0);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x3b3b57de
            || id
                == (bytes4(keccak256("getParent()")) ^ bytes4(keccak256("getSubregistry(string)"))
                        ^ bytes4(keccak256("getResolver(string)")));
    }
}
