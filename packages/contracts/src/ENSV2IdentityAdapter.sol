// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IIdentityAdapter} from "./interfaces/IAccountRegistry.sol";

/// @dev Minimal ABI from ENSv2 IPermissionedRegistry.register; beta API must be rechecked before deployment.
interface IENSV2Registry {
    function register(
        string calldata label,
        address owner,
        address subregistry,
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256);
}

/// @notice Registry-owned, immutable address records keep account identity independent of the current NFT holder.
contract ENSV2IdentityAdapter is IIdentityAdapter, ERC1155Holder {
    IENSV2Registry public immutable ensRegistry;
    bytes32 public immutable parentNode;
    uint64 public immutable expiry;
    address public immutable deployer;
    address public factory;
    mapping(bytes32 => address) private addresses;
    error Unauthorized();
    error InvalidConfiguration();
    event IdentityRegistered(bytes32 indexed node, address indexed account, uint256 ensTokenId);

    constructor(IENSV2Registry registry_, bytes32 parentNode_, uint64 expiry_) {
        if (address(registry_).code.length == 0 || parentNode_ == bytes32(0) || expiry_ <= block.timestamp) {
            revert InvalidConfiguration();
        }
        ensRegistry = registry_;
        parentNode = parentNode_;
        expiry = expiry_;
        deployer = msg.sender;
    }

    function bindFactory(address factory_) external {
        if (msg.sender != deployer || factory != address(0)) revert Unauthorized();
        if (factory_.code.length == 0) revert InvalidConfiguration();
        factory = factory_;
    }

    function register(string calldata label, address account) external returns (bytes32 node) {
        if (msg.sender != factory) revert Unauthorized();
        if (block.timestamp >= expiry || account == address(0)) revert InvalidConfiguration();
        node = keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
        if (addresses[node] != address(0)) revert InvalidConfiguration();
        addresses[node] = account;
        uint256 ensId = ensRegistry.register(label, address(this), address(0), address(this), 0, expiry);
        emit IdentityRegistered(node, account, ensId);
    }

    function addr(bytes32 node) external view returns (address) {
        return addresses[node];
    }

    function supportsInterface(bytes4 id) public view override returns (bool) {
        return id == 0x3b3b57de || super.supportsInterface(id);
    }
}
