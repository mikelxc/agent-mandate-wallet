// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IAccountRegistry {
    function ownerOf(uint256 tokenId) external view returns (address);
    function ownershipEpoch(uint256 tokenId) external view returns (uint256);
}

interface IIdentityAdapter {
    function register(string calldata label, address account) external returns (bytes32 node);
}
