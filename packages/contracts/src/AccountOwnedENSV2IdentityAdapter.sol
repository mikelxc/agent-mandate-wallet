// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ENSV2IdentityAdapter, IENSV2Registry} from "./ENSV2IdentityAdapter.sol";

/// @notice ENSv2 adapter whose registered name is owned by its Kernel account.
/// @dev The account receives only scoped SET_SUBREGISTRY permission. No child
/// registry is installed automatically; the account must attach one itself.
contract AccountOwnedENSV2IdentityAdapter is ENSV2IdentityAdapter {
    uint256 public constant ROLE_SET_SUBREGISTRY = 1 << 20;

    constructor(IENSV2Registry registry_, bytes32 parentNode_, uint64 expiry_)
        ENSV2IdentityAdapter(registry_, parentNode_, expiry_)
    {}

    function _registerName(string calldata label, address account) internal override returns (uint256 ensId) {
        ensId = ensRegistry.register(label, account, address(0), address(this), ROLE_SET_SUBREGISTRY, expiry);
    }
}
