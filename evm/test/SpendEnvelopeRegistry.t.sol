// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SpendEnvelopeRegistry.sol";

contract SpendEnvelopeRegistryTest is Test {
    SpendEnvelopeRegistry public registry;

    address internal operator  = address(0xA1);
    address internal operator2 = address(0xA2);

    // Test fixture — mirrors a real PQSafe SDK envelope
    bytes32 internal constant ENVELOPE_ID      = keccak256("test-envelope-json-bytes");
    bytes32 internal constant SIG_FINGERPRINT  = bytes32(uint256(0xDEADBEEF));
    string  internal constant AGENT            = "research-agent-v1";
    uint128 internal constant MAX_AMOUNT       = 50_000_000; // $50.00 * 1e6
    bytes3  internal constant CURRENCY         = "USD";
    bytes16 internal constant NONCE            = bytes16(uint128(0xABCD1234));

    uint64  internal validUntil; // set in setUp

    function setUp() public {
        registry   = new SpendEnvelopeRegistry();
        validUntil = uint64(block.timestamp + 3600);
    }

    // -------------------------------------------------------------------------
    // commit()
    // -------------------------------------------------------------------------

    function test_commit_success() public {
        vm.prank(operator);
        vm.expectEmit(true, true, true, true);
        emit SpendEnvelopeRegistry.EnvelopeCommitted(
            operator, AGENT, ENVELOPE_ID, SIG_FINGERPRINT,
            MAX_AMOUNT, CURRENCY, validUntil, NONCE
        );
        registry.commit(ENVELOPE_ID, SIG_FINGERPRINT, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);

        assertTrue(registry.isCommitted(ENVELOPE_ID));
        assertEq(registry.operatorCommitCount(operator), 1);
    }

    function test_commit_records_stored_correctly() public {
        vm.prank(operator);
        registry.commit(ENVELOPE_ID, SIG_FINGERPRINT, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);

        SpendEnvelopeRegistry.EnvelopeRecord memory rec = registry.getRecord(ENVELOPE_ID);
        assertEq(rec.operator,       operator);
        assertEq(rec.maxAmount,      MAX_AMOUNT);
        assertEq(rec.currency,       CURRENCY);
        assertEq(rec.validUntil,     validUntil);
        assertEq(rec.nonce,          NONCE);
        assertEq(rec.sigFingerprint, SIG_FINGERPRINT);
        assertFalse(rec.used);
        assertEq(rec.txReference,    bytes32(0));
        assertEq(rec.amountUsed,     0);
        assertEq(rec.committedAt,    uint64(block.timestamp));
    }

    function test_commit_reverts_if_already_committed() public {
        vm.prank(operator);
        registry.commit(ENVELOPE_ID, SIG_FINGERPRINT, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);

        vm.prank(operator);
        vm.expectRevert("PQSafe: already committed");
        registry.commit(ENVELOPE_ID, SIG_FINGERPRINT, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);
    }

    function test_commit_reverts_if_expired() public {
        vm.warp(block.timestamp + 7200); // 2h later
        uint64 expiredUntil = uint64(block.timestamp - 1);

        vm.prank(operator);
        vm.expectRevert("PQSafe: envelope already expired");
        registry.commit(ENVELOPE_ID, SIG_FINGERPRINT, AGENT, MAX_AMOUNT, CURRENCY, expiredUntil, NONCE);
    }

    function test_commit_reverts_zero_amount() public {
        vm.prank(operator);
        vm.expectRevert("PQSafe: maxAmount must be positive");
        registry.commit(ENVELOPE_ID, SIG_FINGERPRINT, AGENT, 0, CURRENCY, validUntil, NONCE);
    }

    function test_commit_reverts_empty_agent() public {
        vm.prank(operator);
        vm.expectRevert("PQSafe: agent must be non-empty");
        registry.commit(ENVELOPE_ID, SIG_FINGERPRINT, "", MAX_AMOUNT, CURRENCY, validUntil, NONCE);
    }

    // -------------------------------------------------------------------------
    // markUsed()
    // -------------------------------------------------------------------------

    function _commit() internal {
        vm.prank(operator);
        registry.commit(ENVELOPE_ID, SIG_FINGERPRINT, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);
    }

    function test_markUsed_success() public {
        _commit();
        bytes32 txRef = keccak256("airwallex-uuid-af82cb1e");
        uint128 amount = 20_000_000; // $20.00

        vm.prank(operator);
        vm.expectEmit(true, false, false, true);
        emit SpendEnvelopeRegistry.EnvelopeUsed(ENVELOPE_ID, txRef, amount);
        registry.markUsed(ENVELOPE_ID, txRef, amount);

        assertTrue(registry.isUsed(ENVELOPE_ID));
        SpendEnvelopeRegistry.EnvelopeRecord memory rec = registry.getRecord(ENVELOPE_ID);
        assertEq(rec.txReference, txRef);
        assertEq(rec.amountUsed,  amount);
    }

    function test_markUsed_reverts_if_not_committed() public {
        vm.prank(operator);
        vm.expectRevert("PQSafe: envelope not committed");
        registry.markUsed(ENVELOPE_ID, bytes32(0), 1_000_000);
    }

    function test_markUsed_reverts_if_wrong_operator() public {
        _commit();

        vm.prank(operator2);
        vm.expectRevert("PQSafe: only operator can mark used");
        registry.markUsed(ENVELOPE_ID, bytes32(0), 1_000_000);
    }

    function test_markUsed_reverts_if_already_used() public {
        _commit();
        vm.prank(operator);
        registry.markUsed(ENVELOPE_ID, keccak256("tx1"), 1_000_000);

        vm.prank(operator);
        vm.expectRevert("PQSafe: already marked used");
        registry.markUsed(ENVELOPE_ID, keccak256("tx2"), 1_000_000);
    }

    function test_markUsed_reverts_over_cap() public {
        _commit();
        uint128 overCap = MAX_AMOUNT + 1;

        vm.prank(operator);
        vm.expectRevert("PQSafe: amountUsed exceeds cap");
        registry.markUsed(ENVELOPE_ID, bytes32(0), overCap);
    }

    // -------------------------------------------------------------------------
    // computeEnvelopeId
    // -------------------------------------------------------------------------

    function test_computeEnvelopeId_matches_keccak() public view {
        bytes memory json = bytes('{"version":1,"agent":"test"}');
        bytes32 expected = keccak256(json);
        assertEq(registry.computeEnvelopeId(json), expected);
    }

    // -------------------------------------------------------------------------
    // Fuzz
    // -------------------------------------------------------------------------

    function testFuzz_commit_different_envelopes(bytes32 id1, bytes32 id2) public {
        vm.assume(id1 != id2);
        vm.prank(operator);
        registry.commit(id1, SIG_FINGERPRINT, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);
        vm.prank(operator);
        registry.commit(id2, SIG_FINGERPRINT, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);

        assertTrue(registry.isCommitted(id1));
        assertTrue(registry.isCommitted(id2));
        assertEq(registry.operatorCommitCount(operator), 2);
    }

    function testFuzz_markUsed_amount_at_cap(uint128 amount) public {
        vm.assume(amount > 0 && amount <= MAX_AMOUNT);
        _commit();
        vm.prank(operator);
        registry.markUsed(ENVELOPE_ID, bytes32(0), amount);
        assertTrue(registry.isUsed(ENVELOPE_ID));
    }
}
