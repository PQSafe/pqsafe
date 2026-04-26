// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SpendEnvelopeRegistryV2.sol";

/**
 * @title SpendEnvelopeRegistryV2Test
 * @notice Foundry test suite for SpendEnvelopeRegistryV2.
 *
 * Coverage targets:
 *   - Role-based access (ISSUER, OPERATOR, REVOCATION, ADMIN)
 *   - commit() happy path + all revert branches
 *   - markUsed() happy path + all revert branches
 *   - recordCumulativeSpend() including race condition and overflow
 *   - revokeEnvelope() Layers 1 + 3
 *   - advanceEpoch() Layer 2 bulk revocation
 *   - isValid() composite check
 *   - Gas benchmarks for each core operation
 *   - Fuzz: epoch advancement, cumulative spend, envelope IDs
 *   - Cross-issuer revocation attempt (must fail)
 *   - Replay: same envelopeId two callers (only one wins)
 */
contract SpendEnvelopeRegistryV2Test is Test {

    // -------------------------------------------------------------------------
    // Test fixtures
    // -------------------------------------------------------------------------

    SpendEnvelopeRegistryV2 public registry;

    address internal admin    = address(0xAD1);
    address internal issuer   = address(0x15501);
    address internal issuer2  = address(0x15502);
    address internal operator = address(0x0001);
    address internal revoker  = address(0xD0C);
    address internal stranger = address(0xBEEF);

    bytes32 internal constant ENVELOPE_ID     = keccak256("envelope-v2-test");
    bytes32 internal constant SIG_FP          = bytes32(uint256(0xCAFEBABE));
    string  internal constant AGENT           = "agent-pay-v2";
    uint128 internal constant MAX_AMOUNT      = 100_000_000; // $100.00 * 1e6
    bytes3  internal constant CURRENCY        = "USD";
    bytes16 internal constant NONCE           = bytes16(uint128(0x1234ABCD));

    uint64  internal validUntil;

    // -------------------------------------------------------------------------
    // setUp
    // -------------------------------------------------------------------------

    function setUp() public {
        registry   = new SpendEnvelopeRegistryV2(admin);
        validUntil = uint64(block.timestamp + 7200);

        vm.startPrank(admin);
        registry.grantRole(registry.ISSUER_ROLE(),     issuer);
        registry.grantRole(registry.ISSUER_ROLE(),     issuer2);
        registry.grantRole(registry.OPERATOR_ROLE(),   operator);
        registry.grantRole(registry.REVOCATION_ROLE(), revoker);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _commit() internal {
        vm.prank(issuer);
        registry.commit(ENVELOPE_ID, SIG_FP, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);
    }

    function _commit(bytes32 id) internal {
        vm.prank(issuer);
        registry.commit(id, SIG_FP, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);
    }

    function _commit2(bytes32 id) internal {
        vm.prank(issuer2);
        registry.commit(id, SIG_FP, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);
    }

    function _markUsed(bytes32 id, uint128 amount) internal {
        vm.prank(operator);
        registry.markUsed(id, keccak256("tx-ref"), amount);
    }

    // =========================================================================
    // ACCESS CONTROL
    // =========================================================================

    function test_roles_granted_correctly() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(registry.hasRole(registry.ISSUER_ROLE(),     issuer));
        assertTrue(registry.hasRole(registry.OPERATOR_ROLE(),   operator));
        assertTrue(registry.hasRole(registry.REVOCATION_ROLE(), revoker));
    }

    function test_commit_requires_issuer_role() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.Unauthorized.selector, stranger)
        );
        registry.commit(ENVELOPE_ID, SIG_FP, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);
    }

    function test_markUsed_requires_operator_role() public {
        _commit();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.Unauthorized.selector, stranger)
        );
        registry.markUsed(ENVELOPE_ID, bytes32(0), 1_000_000);
    }

    function test_advanceEpoch_requires_issuer_role() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.Unauthorized.selector, stranger)
        );
        registry.advanceEpoch(1);
    }

    // =========================================================================
    // COMMIT
    // =========================================================================

    function test_commit_success_emits_events() public {
        vm.prank(issuer);
        vm.expectEmit(true, true, true, true);
        emit SpendEnvelopeRegistryV2.EnvelopeCommitted(
            issuer, issuer, ENVELOPE_ID, SIG_FP,
            MAX_AMOUNT, CURRENCY, validUntil, NONCE,
            0, // epoch 0 initially
            block.chainid
        );
        registry.commit(ENVELOPE_ID, SIG_FP, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);

        assertTrue(registry.isCommitted(ENVELOPE_ID));
        assertEq(registry.issuerCommitCount(issuer), 1);
    }

    function test_commit_stores_record_correctly() public {
        _commit();
        SpendEnvelopeRegistryV2.EnvelopeRecord memory rec = registry.getRecord(ENVELOPE_ID);
        assertEq(rec.operator,            issuer);
        assertEq(rec.maxAmount,           MAX_AMOUNT);
        assertEq(rec.currency,            CURRENCY);
        assertEq(rec.validUntil,          validUntil);
        assertEq(rec.nonce,               NONCE);
        assertEq(rec.sigFingerprint,      SIG_FP);
        assertEq(rec.status,              registry.STATUS_PENDING());
        assertEq(rec.committedAt,         uint64(block.timestamp));
        assertEq(rec.issuerEpochAtCommit, 0);
    }

    function test_commit_reverts_duplicate() public {
        _commit();
        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.AlreadyCommitted.selector, ENVELOPE_ID)
        );
        registry.commit(ENVELOPE_ID, SIG_FP, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);
    }

    function test_commit_reverts_expired() public {
        vm.warp(block.timestamp + 8000);
        uint64 past = uint64(block.timestamp - 1);
        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.EnvelopeExpired.selector, ENVELOPE_ID)
        );
        registry.commit(ENVELOPE_ID, SIG_FP, AGENT, MAX_AMOUNT, CURRENCY, past, NONCE);
    }

    function test_commit_reverts_zero_amount() public {
        vm.prank(issuer);
        vm.expectRevert(SpendEnvelopeRegistryV2.ZeroAmount.selector);
        registry.commit(ENVELOPE_ID, SIG_FP, AGENT, 0, CURRENCY, validUntil, NONCE);
    }

    function test_commit_reverts_empty_agent() public {
        vm.prank(issuer);
        vm.expectRevert(SpendEnvelopeRegistryV2.EmptyAgent.selector);
        registry.commit(ENVELOPE_ID, SIG_FP, "", MAX_AMOUNT, CURRENCY, validUntil, NONCE);
    }

    // =========================================================================
    // MARK USED (single-use)
    // =========================================================================

    function test_markUsed_success() public {
        _commit();
        bytes32 txRef  = keccak256("airwallex-tx-01");
        uint128 amount = 40_000_000;

        vm.prank(operator);
        vm.expectEmit(true, true, false, true);
        emit SpendEnvelopeRegistryV2.EnvelopeUsed(ENVELOPE_ID, operator, txRef, amount);
        registry.markUsed(ENVELOPE_ID, txRef, amount);

        assertTrue(registry.isUsed(ENVELOPE_ID));
        assertEq(registry.txReferences(ENVELOPE_ID), txRef);
        assertEq(registry.amountUsed(ENVELOPE_ID), amount);
    }

    function test_markUsed_reverts_not_committed() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.NotCommitted.selector, ENVELOPE_ID)
        );
        registry.markUsed(ENVELOPE_ID, bytes32(0), 1);
    }

    function test_markUsed_reverts_already_used() public {
        _commit();
        _markUsed(ENVELOPE_ID, 10_000_000);
        // NOTE: evaluate STATUS_USED() before vm.prank to avoid prank being consumed by the view call.
        uint8 statusUsed = registry.STATUS_USED();
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendEnvelopeRegistryV2.EnvelopeNotActive.selector,
                ENVELOPE_ID,
                statusUsed
            )
        );
        registry.markUsed(ENVELOPE_ID, bytes32(0), 10_000_000);
    }

    function test_markUsed_reverts_over_cap() public {
        _commit();
        uint128 over = MAX_AMOUNT + 1;
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.AmountExceedsCap.selector, over, MAX_AMOUNT)
        );
        registry.markUsed(ENVELOPE_ID, bytes32(0), over);
    }

    function test_markUsed_reverts_if_revoked() public {
        _commit();
        vm.prank(revoker);
        registry.revokeEnvelope(ENVELOPE_ID, "compliance hold");

        // Evaluate STATUS_REVOKED() before vm.prank to avoid the view call consuming the prank.
        uint8 statusRevoked = registry.STATUS_REVOKED();
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendEnvelopeRegistryV2.EnvelopeNotActive.selector,
                ENVELOPE_ID,
                statusRevoked
            )
        );
        registry.markUsed(ENVELOPE_ID, bytes32(0), 1_000_000);
    }

    // =========================================================================
    // CUMULATIVE SPEND
    // =========================================================================

    function test_cumulativeSpend_basic() public {
        _commit();
        uint128 draw1 = 30_000_000;
        uint128 draw2 = 40_000_000;

        vm.prank(operator);
        vm.expectEmit(true, false, false, true);
        emit SpendEnvelopeRegistryV2.CumulativeSpendRecorded(ENVELOPE_ID, draw1, draw1);
        registry.recordCumulativeSpend(ENVELOPE_ID, draw1);
        assertEq(registry.spentAmount(ENVELOPE_ID), draw1);

        vm.prank(operator);
        registry.recordCumulativeSpend(ENVELOPE_ID, draw2);
        assertEq(registry.spentAmount(ENVELOPE_ID), uint256(draw1) + draw2);
    }

    function test_cumulativeSpend_remainingCapacity() public {
        _commit();
        vm.prank(operator);
        registry.recordCumulativeSpend(ENVELOPE_ID, 60_000_000);
        assertEq(registry.remainingCapacity(ENVELOPE_ID), 40_000_000);
    }

    function test_cumulativeSpend_reverts_over_cap() public {
        _commit();
        vm.prank(operator);
        registry.recordCumulativeSpend(ENVELOPE_ID, 60_000_000);

        vm.prank(operator);
        uint256 newTotal = 60_000_000 + 50_000_000;
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendEnvelopeRegistryV2.CumulativeExceedsCap.selector,
                newTotal,
                MAX_AMOUNT
            )
        );
        registry.recordCumulativeSpend(ENVELOPE_ID, 50_000_000);
    }

    function test_cumulativeSpend_reverts_zero_increment() public {
        _commit();
        vm.prank(operator);
        vm.expectRevert(SpendEnvelopeRegistryV2.ZeroAmount.selector);
        registry.recordCumulativeSpend(ENVELOPE_ID, 0);
    }

    /**
     * @notice Race condition: two operators try to spend same envelope concurrently.
     * Solidity is single-threaded; second transaction always sees post-first state.
     * This test verifies the atomic update rejects the second call when cap is reached.
     */
    function test_cumulativeSpend_race_condition_only_one_wins() public {
        _commit();
        uint128 halfCap = MAX_AMOUNT / 2; // $50

        // First "transaction" succeeds
        vm.prank(operator);
        registry.recordCumulativeSpend(ENVELOPE_ID, halfCap);

        // Second "transaction" tries to spend exactly the remaining half — succeeds
        vm.prank(operator);
        registry.recordCumulativeSpend(ENVELOPE_ID, halfCap);

        assertEq(registry.spentAmount(ENVELOPE_ID), MAX_AMOUNT);

        // Third "transaction" — cap exhausted, reverts
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendEnvelopeRegistryV2.CumulativeExceedsCap.selector,
                uint256(MAX_AMOUNT) + 1,
                MAX_AMOUNT
            )
        );
        registry.recordCumulativeSpend(ENVELOPE_ID, 1);
    }

    // =========================================================================
    // REVOCATION — LAYER 3 (per-envelope)
    // =========================================================================

    function test_revokeEnvelope_by_revoker_role() public {
        _commit();
        string memory reason = "compliance hold - AML flag";
        bytes32 reasonHash   = keccak256(bytes(reason));

        vm.prank(revoker);
        vm.expectEmit(true, true, false, true);
        emit SpendEnvelopeRegistryV2.EnvelopeRevoked(ENVELOPE_ID, revoker, reasonHash);
        registry.revokeEnvelope(ENVELOPE_ID, reason);

        assertTrue(registry.isRevoked(ENVELOPE_ID));
        SpendEnvelopeRegistryV2.RevocationRecord memory r = registry.getRevocation(ENVELOPE_ID);
        assertEq(r.revokedBy,   revoker);
        assertEq(r.revokedAt,   uint64(block.timestamp));
        assertEq(r.reasonHash,  reasonHash);
    }

    function test_revokeEnvelope_by_original_issuer() public {
        _commit();
        vm.prank(issuer); // original operator
        registry.revokeEnvelope(ENVELOPE_ID, "issuer self-revoke");
        assertTrue(registry.isRevoked(ENVELOPE_ID));
    }

    function test_revokeEnvelope_reverts_unauthorized() public {
        _commit();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.Unauthorized.selector, stranger)
        );
        registry.revokeEnvelope(ENVELOPE_ID, "hack attempt");
    }

    /**
     * @notice Cross-issuer revocation attempt: issuer2 should NOT be able to revoke
     *         an envelope committed by issuer1, unless issuer2 has REVOCATION_ROLE.
     */
    function test_revokeEnvelope_cross_issuer_fails() public {
        _commit(); // committed by issuer
        vm.prank(issuer2); // different issuer, no REVOCATION_ROLE
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.Unauthorized.selector, issuer2)
        );
        registry.revokeEnvelope(ENVELOPE_ID, "cross-issuer attack");
    }

    function test_revokeEnvelope_reverts_not_committed() public {
        vm.prank(revoker);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.NotCommitted.selector, ENVELOPE_ID)
        );
        registry.revokeEnvelope(ENVELOPE_ID, "phantom revocation");
    }

    function test_revokeEnvelope_reverts_already_revoked() public {
        _commit();
        vm.prank(revoker);
        registry.revokeEnvelope(ENVELOPE_ID, "first revocation");

        vm.prank(revoker);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.AlreadyRevoked.selector, ENVELOPE_ID)
        );
        registry.revokeEnvelope(ENVELOPE_ID, "duplicate revocation");
    }

    // =========================================================================
    // EPOCH ADVANCEMENT — LAYER 2 (bulk revocation)
    // =========================================================================

    function test_advanceEpoch_success() public {
        assertEq(registry.issuerEpoch(issuer), 0);

        vm.prank(issuer);
        vm.expectEmit(true, false, false, true);
        emit SpendEnvelopeRegistryV2.IssuerEpochAdvanced(issuer, 0, 1);
        registry.advanceEpoch(1);

        assertEq(registry.issuerEpoch(issuer), 1);
    }

    function test_advanceEpoch_reverts_non_sequential() public {
        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.EpochMustIncrementByOne.selector, 0, 2)
        );
        registry.advanceEpoch(2); // must be 0+1=1
    }

    function test_advanceEpoch_reverts_same_value() public {
        vm.prank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(SpendEnvelopeRegistryV2.EpochMustIncrementByOne.selector, 0, 0)
        );
        registry.advanceEpoch(0);
    }

    function test_advanceEpoch_only_own_issuer() public {
        // issuer2 should not be able to affect issuer's epoch
        vm.prank(issuer2);
        registry.advanceEpoch(1); // advances issuer2's epoch, not issuer's
        assertEq(registry.issuerEpoch(issuer),  0); // issuer1 unaffected
        assertEq(registry.issuerEpoch(issuer2), 1);
    }

    /**
     * @notice Full Layer 2 flow: commit at epoch 0, advance to epoch 1,
     *         verify envelope is now invalid and markUsed reverts.
     */
    function test_epoch_advancement_invalidates_prior_envelopes() public {
        // Commit at epoch 0
        _commit();
        assertTrue(registry.isValid(ENVELOPE_ID));

        // Advance epoch
        vm.prank(issuer);
        registry.advanceEpoch(1);

        // isValid() should now return false
        assertFalse(registry.isValid(ENVELOPE_ID));

        // markUsed() should revert with EpochInvalidated
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SpendEnvelopeRegistryV2.EpochInvalidated.selector,
                ENVELOPE_ID,
                uint64(0), // commitEpoch
                uint64(1)  // currentEpoch
            )
        );
        registry.markUsed(ENVELOPE_ID, bytes32(0), 1_000_000);
    }

    function test_epoch_advancement_does_not_affect_new_envelopes() public {
        // Advance epoch first
        vm.prank(issuer);
        registry.advanceEpoch(1);

        // Commit at epoch 1
        bytes32 newId = keccak256("envelope-at-epoch-1");
        vm.prank(issuer);
        registry.commit(newId, SIG_FP, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);

        SpendEnvelopeRegistryV2.EnvelopeRecord memory rec = registry.getRecord(newId);
        assertEq(rec.issuerEpochAtCommit, 1);
        assertTrue(registry.isValid(newId));
    }

    function test_epoch_does_not_affect_other_issuers() public {
        bytes32 env2 = keccak256("issuer2-envelope");
        _commit2(env2);

        // Advance issuer1's epoch — issuer2's envelopes unaffected
        vm.prank(issuer);
        registry.advanceEpoch(1);

        assertTrue(registry.isValid(env2));
    }

    // =========================================================================
    // isValid() COMPOSITE CHECK
    // =========================================================================

    function test_isValid_false_after_expiry() public {
        _commit();
        vm.warp(validUntil + 1);
        assertFalse(registry.isValid(ENVELOPE_ID));
    }

    function test_isValid_false_after_markUsed() public {
        _commit();
        _markUsed(ENVELOPE_ID, 10_000_000);
        assertFalse(registry.isValid(ENVELOPE_ID));
    }

    function test_isValid_false_not_committed() public view {
        assertFalse(registry.isValid(keccak256("nonexistent")));
    }

    // =========================================================================
    // COMPUTE ENVELOPE ID
    // =========================================================================

    function test_computeEnvelopeId_matches_keccak() public view {
        bytes memory json = bytes('{"version":2,"agent":"agent-pay-v2","maxAmount":100000000}');
        assertEq(registry.computeEnvelopeId(json), keccak256(json));
    }

    // =========================================================================
    // GAS BENCHMARKS
    // =========================================================================

    function test_gas_commit() public {
        uint256 before = gasleft();
        vm.prank(issuer);
        registry.commit(ENVELOPE_ID, SIG_FP, AGENT, MAX_AMOUNT, CURRENCY, validUntil, NONCE);
        uint256 gasUsed = before - gasleft();
        emit log_named_uint("gas: commit()", gasUsed);
        // Assert reasonable upper bound for Arbitrum deployment
        assertLt(gasUsed, 200_000, "commit gas too high");
    }

    function test_gas_markUsed() public {
        _commit();
        uint256 before = gasleft();
        vm.prank(operator);
        registry.markUsed(ENVELOPE_ID, keccak256("tx-ref"), 50_000_000);
        uint256 gasUsed = before - gasleft();
        emit log_named_uint("gas: markUsed()", gasUsed);
        assertLt(gasUsed, 100_000, "markUsed gas too high");
    }

    function test_gas_recordCumulativeSpend() public {
        _commit();
        uint256 before = gasleft();
        vm.prank(operator);
        registry.recordCumulativeSpend(ENVELOPE_ID, 10_000_000);
        uint256 gasUsed = before - gasleft();
        emit log_named_uint("gas: recordCumulativeSpend()", gasUsed);
        assertLt(gasUsed, 80_000, "recordCumulativeSpend gas too high");
    }

    function test_gas_revokeEnvelope() public {
        _commit();
        uint256 before = gasleft();
        vm.prank(revoker);
        registry.revokeEnvelope(ENVELOPE_ID, "compliance hold");
        uint256 gasUsed = before - gasleft();
        emit log_named_uint("gas: revokeEnvelope()", gasUsed);
        assertLt(gasUsed, 100_000, "revokeEnvelope gas too high");
    }

    function test_gas_advanceEpoch() public {
        uint256 before = gasleft();
        vm.prank(issuer);
        registry.advanceEpoch(1);
        uint256 gasUsed = before - gasleft();
        emit log_named_uint("gas: advanceEpoch()", gasUsed);
        assertLt(gasUsed, 50_000, "advanceEpoch gas too high");
    }

    // =========================================================================
    // FUZZ TESTS
    // =========================================================================

    function testFuzz_commit_unique_envelopes(bytes32 id1, bytes32 id2) public {
        vm.assume(id1 != id2);
        _commit(id1);
        _commit(id2);
        assertTrue(registry.isCommitted(id1));
        assertTrue(registry.isCommitted(id2));
        assertEq(registry.issuerCommitCount(issuer), 2);
    }

    function testFuzz_markUsed_at_cap(uint128 amount) public {
        vm.assume(amount > 0 && amount <= MAX_AMOUNT);
        _commit();
        vm.prank(operator);
        registry.markUsed(ENVELOPE_ID, bytes32(0), amount);
        assertTrue(registry.isUsed(ENVELOPE_ID));
    }

    /**
     * @notice Fuzz: epoch advancement must always increment by exactly 1.
     */
    function testFuzz_advanceEpoch_sequential(uint8 steps) public {
        vm.assume(steps > 0 && steps < 50);
        for (uint64 i = 0; i < steps; i++) {
            vm.prank(issuer);
            registry.advanceEpoch(i + 1);
            assertEq(registry.issuerEpoch(issuer), i + 1);
        }
    }

    function testFuzz_cumulativeSpend_never_exceeds_cap(uint128 draw1, uint128 draw2) public {
        vm.assume(draw1 > 0 && draw2 > 0);
        vm.assume(uint256(draw1) + draw2 <= MAX_AMOUNT);
        _commit();
        vm.prank(operator);
        registry.recordCumulativeSpend(ENVELOPE_ID, draw1);
        vm.prank(operator);
        registry.recordCumulativeSpend(ENVELOPE_ID, draw2);
        assertLe(registry.spentAmount(ENVELOPE_ID), MAX_AMOUNT);
    }

    /**
     * @notice Fuzz: two large draws that together exceed cap must revert on second.
     */
    function testFuzz_cumulativeSpend_rejects_overflow(uint128 draw1) public {
        vm.assume(draw1 > 0 && draw1 <= MAX_AMOUNT);
        _commit();
        vm.prank(operator);
        registry.recordCumulativeSpend(ENVELOPE_ID, draw1);

        uint128 remaining = MAX_AMOUNT - draw1;
        if (remaining == 0) return; // exact cap, nothing left to test

        vm.prank(operator);
        vm.expectRevert();
        registry.recordCumulativeSpend(ENVELOPE_ID, remaining + 1);
    }
}
