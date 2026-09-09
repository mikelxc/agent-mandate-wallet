// SPDX-License-Identifier: MIT
pragma solidity ^0.8.33;

import {AccountFactory} from "../src/AccountFactory.sol";
import {Test} from "forge-std/Test.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {KernelUUPS} from "kernel-v4/KernelUUPS.sol";
import {KernelImmutableECDSA} from "kernel-v4/KernelImmutableECDSA.sol";
import {KernelFactory} from "kernel-v4/KernelFactory.sol";
import {Install} from "kernel-v4/types/Structs.sol";
import {Kernel} from "kernel-v4/Kernel.sol";
import {IIdentityAdapter} from "../src/interfaces/IAccountRegistry.sol";
import {PasskeyAccountFactory, PasskeyAccountFactoryBase} from "../src/PasskeyAccountFactory.sol";
import {WebAuthnValidator} from "../src/vendor/zerodev/WebAuthnValidator.sol";
import {Base64URL} from "../src/vendor/zerodev/Base64URL.sol";
import {P256} from "@openzeppelin/contracts/utils/cryptography/P256.sol";

import {P256} from "@openzeppelin/contracts/utils/cryptography/P256.sol";

/// Test-only software verification at the expected fallback address, not a signature mock.
contract P256VerifierShim {
    fallback(bytes calldata data) external returns (bytes memory) {
        (bytes32 h, bytes32 r, bytes32 s, bytes32 x, bytes32 y) =
            abi.decode(data, (bytes32, bytes32, bytes32, bytes32, bytes32));
        return abi.encode(P256.verifySolidity(h, r, s, x, y) ? uint256(1) : uint256(0));
    }
}

contract PasskeyAccountTest is Test {
    EntryPoint ep;
    KernelFactory kernels;
    WebAuthnValidator validator;
    PasskeyAccountFactory factory;
    uint256 constant PASSKEY = 0x12345;
    PasskeyAccountFactoryBase.Passkey key;
    uint256 px;
    uint256 py;
    uint256 relayKey = 0xBEEF;
    uint256 constant P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551;
    uint256 constant P256_N_DIV_2 = 57896044605178124381348723474703786764998477612067880171211129530534256022184;

    function setUp() public {
        vm.etch(0xc2b78104907F722DABAc4C69f826a522B2754De4, address(new P256VerifierShim()).code);
        ep = new EntryPoint();
        kernels = new KernelFactory(
            new KernelUUPS(IEntryPoint(address(ep))), new KernelImmutableECDSA(IEntryPoint(address(ep)))
        );
        validator = new WebAuthnValidator();
        factory = new PasskeyAccountFactory(IIdentityAdapter(address(0)), kernels, validator);
        vm.etch(address(0xc2b78104907F722DABAc4C69f826a522B2754De4), address(new P256VerifierShim()).code);
        (px, py) = vm.publicKeyP256(PASSKEY);
        key = PasskeyAccountFactoryBase.Passkey(px, py);
    }

    function _client(bytes32 challenge) internal pure returns (string memory) {
        return string.concat(
            '{"type":"webauthn.get","challenge":"',
            Base64URL.encode(abi.encodePacked(challenge)),
            '","origin":"https://example.test"}'
        );
    }

    function _proof(bytes32 challenge, uint256 signingKey) internal returns (bytes memory) {
        return _proofFlags(challenge, signingKey, 0x05);
    }

    function _proofFlags(bytes32 challenge, uint256 signingKey, bytes1 flags) internal returns (bytes memory) {
        bytes memory auth = abi.encodePacked(bytes32(0), flags, bytes4(0));
        string memory client = _client(challenge);
        bytes32 digest = sha256(abi.encodePacked(auth, sha256(bytes(client))));
        (bytes32 r, bytes32 s) = vm.signP256(signingKey, digest);
        if (uint256(s) > P256_N_DIV_2) s = bytes32(P256_N - uint256(s));
        return abi.encode(auth, client, uint256(1), uint256(r), uint256(s), false);
    }

    function _create(string memory label, uint256 deadline) internal returns (uint256 id, address account) {
        bytes32 digest = factory.registrationDigest(key, label, deadline);
        return factory.createAccount(key, label, deadline, _proof(digest, PASSKEY));
    }

    function testDeterministicAddressIgnoresLabelAndIdentityId() public {
        address predicted = factory.accountAddress(key);
        (uint256 otherId,) = _createOther("other-label");
        assertEq(otherId, 1);
        (uint256 id, address account) = _create("first-label", block.timestamp + 1 days);
        assertEq(id, 2);
        assertEq(account, predicted);
        assertEq(factory.accountForKey(factory.keyHash(key)), account);
        assertEq(factory.ownerOf(id), account);
    }

    function _createOther(string memory label) internal returns (uint256 id, address account) {
        (uint256 ox, uint256 oy) = vm.publicKeyP256(PASSKEY + 7);
        PasskeyAccountFactoryBase.Passkey memory otherKey = PasskeyAccountFactoryBase.Passkey(ox, oy);
        bytes32 digest = factory.registrationDigest(otherKey, label, block.timestamp + 1 days);
        return factory.createAccount(otherKey, label, block.timestamp + 1 days, _proof(digest, PASSKEY + 7));
    }

    function testSelfOwnedIdentityAndLegacyCreationAreImmutable() public {
        (uint256 id, address account) = _create("self-owned", block.timestamp + 1 days);
        assertEq(factory.ownerOf(id), account);
        vm.expectRevert(PasskeyAccountFactoryBase.SelfOwnedIdentity.selector);
        factory.proposeHandover(id, address(this));
        vm.expectRevert(PasskeyAccountFactoryBase.SelfOwnedIdentity.selector);
        factory.cancelHandover(id);
        vm.expectRevert(PasskeyAccountFactoryBase.SelfOwnedIdentity.selector);
        factory.acceptHandover(id);
        vm.startPrank(account);
        vm.expectRevert(AccountFactory.UseHandover.selector);
        factory.transferFrom(account, address(this), id);
        vm.expectRevert(AccountFactory.UseHandover.selector);
        factory.safeTransferFrom(account, address(this), id);
        vm.expectRevert(AccountFactory.UseHandover.selector);
        factory.safeTransferFrom(account, address(this), id, "");
        vm.expectRevert(AccountFactory.UseHandover.selector);
        factory.approve(address(this), id);
        vm.expectRevert(AccountFactory.UseHandover.selector);
        factory.setApprovalForAll(address(this), true);
        vm.stopPrank();
        vm.expectRevert(PasskeyAccountFactoryBase.PasskeyRequired.selector);
        factory.createAccount("legacy");
    }

    function testProofRejectsWrongKeyLabelExpiryAndCrossFactoryReplay() public {
        string memory label = "proof-bound";
        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = factory.registrationDigest(key, label, deadline);
        PasskeyAccountFactoryBase.Passkey memory wrong = PasskeyAccountFactoryBase.Passkey(px + 1, py);
        bytes memory wrongKeyProof = _proof(digest, PASSKEY);
        bytes memory wrongLabelProof = _proof(digest, PASSKEY);
        bytes memory expiredProof = _proof(digest, PASSKEY);
        vm.expectRevert(PasskeyAccountFactoryBase.InvalidProof.selector);
        factory.createAccount(wrong, label, deadline, wrongKeyProof);
        vm.expectRevert(PasskeyAccountFactoryBase.InvalidProof.selector);
        factory.createAccount(key, "different", deadline, wrongLabelProof);
        PasskeyAccountFactory second = new PasskeyAccountFactory(IIdentityAdapter(address(0)), kernels, validator);
        vm.expectRevert(PasskeyAccountFactoryBase.InvalidProof.selector);
        second.createAccount(key, label, deadline, wrongKeyProof);
        vm.warp(deadline + 1);
        vm.expectRevert(PasskeyAccountFactoryBase.ExpiredProof.selector);
        factory.createAccount(key, label, deadline, expiredProof);
    }

    function testDuplicateKeyRejected() public {
        uint256 deadline = block.timestamp + 1 days;
        _create("one", deadline);
        bytes memory duplicateProof = _proof(factory.registrationDigest(key, "two", deadline), PASSKEY);
        vm.expectRevert(PasskeyAccountFactoryBase.KeyAlreadyRegistered.selector);
        factory.createAccount(key, "two", deadline, duplicateProof);
    }

    function testWebAuthnProofRequiresUserPresenceAndVerification() public {
        string memory label = "flags";
        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = factory.registrationDigest(key, label, deadline);
        bytes memory noUv = _proofFlags(digest, PASSKEY, 0x01);
        bytes memory noUp = _proofFlags(digest, PASSKEY, 0x04);
        vm.expectRevert(PasskeyAccountFactoryBase.InvalidProof.selector);
        factory.createAccount(key, label, deadline, noUv);
        vm.expectRevert(PasskeyAccountFactoryBase.InvalidProof.selector);
        factory.createAccount(key, label, deadline, noUp);
    }

    function testInvalidP256SignatureAndWrongChainProofRejected() public {
        string memory label = "invalid-p256";
        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = factory.registrationDigest(key, label, deadline);
        bytes memory invalidP256 = _proof(digest, PASSKEY + 1);
        vm.expectRevert(PasskeyAccountFactoryBase.InvalidProof.selector);
        factory.createAccount(key, label, deadline, invalidP256);
        vm.chainId(1);
        bytes memory wrongChain = _proof(digest, PASSKEY);
        vm.expectRevert(PasskeyAccountFactoryBase.InvalidProof.selector);
        factory.createAccount(key, label, deadline, wrongChain);
    }

    function testPermissionlessCreationDeploysAfterUpstreamPredeployment() public {
        address predicted = factory.accountAddress(key);
        Install[] memory packages = new Install[](1);
        packages[0] = Install(1, address(validator), abi.encode(px, py, bytes32(0)), "");
        kernels.deploy(packages, factory.accountNonce(key));
        assertGt(predicted.code.length, 0);
        (uint256 id, address account) = _create("predeployed", block.timestamp + 1 days);
        assertEq(account, predicted);
        assertEq(factory.ownerOf(id), account);
    }

    function testPredeployedAccountWithChangedKeyCannotRegister() public {
        Install[] memory packages = new Install[](1);
        packages[0] = Install(1, address(validator), abi.encode(px, py, bytes32(0)), "");
        address account = address(kernels.deploy(packages, factory.accountNonce(key)));
        (uint256 x, uint256 y) = vm.publicKeyP256(PASSKEY + 1);
        vm.startPrank(account);
        validator.onUninstall("");
        validator.onInstall(abi.encode(x, y, bytes32(0)));
        vm.stopPrank();
        uint256 deadline = block.timestamp + 1 days;
        bytes memory proof = _proof(factory.registrationDigest(key, "changed-key", deadline), PASSKEY);
        vm.expectRevert(PasskeyAccountFactoryBase.InvalidPasskey.selector);
        factory.createAccount(key, "changed-key", deadline, proof);
        assertEq(factory.nextTokenId(), 1);
    }

    function testPredeployedAccountWithDifferentRootCannotRegister() public {
        Install[] memory packages = new Install[](1);
        packages[0] = Install(1, address(validator), abi.encode(px, py, bytes32(0)), "");
        Kernel account = kernels.deploy(packages, factory.accountNonce(key));
        WebAuthnValidator replacement = new WebAuthnValidator();
        packages[0].module = address(replacement);
        vm.prank(address(account));
        account.setRoot(packages, true, "");
        uint256 deadline = block.timestamp + 1 days;
        bytes memory proof = _proof(factory.registrationDigest(key, "changed-root", deadline), PASSKEY);
        vm.expectRevert(PasskeyAccountFactoryBase.UnexpectedAccountConfiguration.selector);
        factory.createAccount(key, "changed-root", deadline, proof);
        assertEq(factory.accountForKey(factory.keyHash(key)), address(0));
    }

    function testEntryPoint09ExecutesWithPasskeyAndRejectsWrongSignature() public {
        (, address account) = _create("entrypoint", block.timestamp + 1 days);
        vm.deal(account, 1 ether);
        PackedUserOperation memory u = _op(account, 0, 0.1 ether, PASSKEY);
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = u;
        vm.prank(vm.addr(relayKey), vm.addr(relayKey));
        ep.handleOps(ops, payable(address(0xCAFE)));
        assertEq(vm.addr(relayKey).balance, 0.1 ether);

        PackedUserOperation memory bad = _op(account, 1, 0.1 ether, PASSKEY + 1);
        ops[0] = bad;
        vm.prank(vm.addr(relayKey), vm.addr(relayKey));
        vm.expectRevert(abi.encodeWithSignature("FailedOp(uint256,string)", 0, "AA24 signature error"));
        ep.handleOps(ops, payable(address(0xCAFE)));
    }

    function _op(address account, uint256 nonce, uint256 amount, uint256 signingKey)
        internal
        returns (PackedUserOperation memory u)
    {
        u.sender = account;
        u.nonce = nonce;
        u.callData =
            abi.encodeCall(Kernel(payable(account)).execute, (bytes32(0), abi.encodePacked(vm.addr(relayKey), amount)));
        u.accountGasLimits = bytes32((uint256(700_000) << 128) | uint256(700_000));
        u.preVerificationGas = 60_000;
        u.gasFees = bytes32((uint256(1 gwei) << 128) | uint256(1 gwei));
        u.signature = _proof(ep.getUserOpHash(u), signingKey);
    }
}
