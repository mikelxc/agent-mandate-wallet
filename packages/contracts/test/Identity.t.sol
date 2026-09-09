// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Test} from "forge-std/Test.sol";
import {ENSV2IdentityAdapter, IENSV2Registry} from "../src/ENSV2IdentityAdapter.sol";
import {AccountOwnedENSV2IdentityAdapter} from "../src/AccountOwnedENSV2IdentityAdapter.sol";
import {AccountFactory} from "../src/AccountFactory.sol";
import {IIdentityAdapter} from "../src/interfaces/IAccountRegistry.sol";

contract MockENSRegistry is IENSV2Registry {
    bool public fail;
    address public owner;
    address public subregistry;
    address public resolver;
    uint256 public roles;

    function setFail(bool value) external {
        fail = value;
    }

    function register(string calldata, address owner_, address subregistry_, address resolver_, uint256 roles_, uint64)
        external
        returns (uint256)
    {
        require(!fail, "ENS unavailable");
        owner = owner_;
        subregistry = subregistry_;
        resolver = resolver_;
        roles = roles_;
        return 1;
    }
}

contract IdentityTest is Test {
    MockENSRegistry ens;
    ENSV2IdentityAdapter adapter;
    AccountFactory factory;
    bytes32 parent = keccak256("test parent");
    address alice = makeAddr("alice");

    function setUp() public {
        ens = new MockENSRegistry();
        adapter = new ENSV2IdentityAdapter(ens, parent, uint64(block.timestamp + 365 days));
        factory = new AccountFactory(IIdentityAdapter(address(adapter)));
        adapter.bindFactory(address(factory));
    }

    function testAtomicRegistrationAndResolution() public {
        vm.prank(alice);
        (, address account) = factory.createAccount("research");
        bytes32 node = keccak256(abi.encodePacked(parent, keccak256("research")));
        assertEq(adapter.addr(node), account);
        assertEq(ens.owner(), address(adapter));
        assertEq(ens.resolver(), address(adapter));
    }

    function testENSFailureRollsBackMint() public {
        ens.setFail(true);
        vm.prank(alice);
        vm.expectRevert("ENS unavailable");
        factory.createAccount("research");
        assertEq(factory.nextTokenId(), 1);
        assertFalse(factory.registeredLabels(keccak256("research")));
    }

    function testOnlyFactoryRegisters() public {
        vm.expectRevert(ENSV2IdentityAdapter.Unauthorized.selector);
        adapter.register("evil", alice);
    }

    function testBindingCannotChange() public {
        vm.expectRevert(ENSV2IdentityAdapter.Unauthorized.selector);
        adapter.bindFactory(alice);
    }

    function testAccountOwnedNameUsesAccountOwnerAndScopedSubregistryRole() public {
        AccountOwnedENSV2IdentityAdapter accountOwned = new AccountOwnedENSV2IdentityAdapter(
            ens, parent, uint64(block.timestamp + 365 days)
        );
        AccountFactory accountFactory = new AccountFactory(IIdentityAdapter(address(accountOwned)));
        accountOwned.bindFactory(address(accountFactory));

        vm.prank(alice);
        (, address account) = accountFactory.createAccount("passkey");

        assertEq(ens.owner(), account);
        assertEq(ens.resolver(), address(accountOwned));
        assertEq(ens.subregistry(), address(0));
        assertEq(ens.roles(), accountOwned.ROLE_SET_SUBREGISTRY());
    }

    function testAccountOwnedBindingAndENSFailureAreAtomic() public {
        AccountOwnedENSV2IdentityAdapter accountOwned = new AccountOwnedENSV2IdentityAdapter(
            ens, parent, uint64(block.timestamp + 365 days)
        );
        AccountFactory accountFactory = new AccountFactory(IIdentityAdapter(address(accountOwned)));
        accountOwned.bindFactory(address(accountFactory));
        vm.expectRevert(ENSV2IdentityAdapter.Unauthorized.selector);
        accountOwned.bindFactory(alice);

        ens.setFail(true);
        vm.prank(alice);
        vm.expectRevert("ENS unavailable");
        accountFactory.createAccount("passkey");
        assertEq(accountFactory.nextTokenId(), 1);
        assertFalse(accountFactory.registeredLabels(keccak256("passkey")));
    }
}
