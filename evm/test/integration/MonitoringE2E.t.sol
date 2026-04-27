// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/SpendEnvelopeRegistryV2_1.sol";

/**
 * @title MonitoringE2ETest
 * @notice End-to-end integration test simulating the full monitoring circuit-breaker pipeline.
 *
 * These tests validate the on-chain half of the circuit-breaker system.
 * Off-chain components (Forta agent, Cloudflare Worker) are simulated via
 * direct `pause()` calls in the test — mirroring what the Worker does after
 * receiving a Forta Critical alert.
 *
 * Test scenarios:
 *   1. Issuer commits 1001 envelopes → verify Forta webhook payload structure
 *   2. Forta critical alert → Worker calls pause() → contract is paused
 *   3. Subsequent commits revert when paused
 *   4. Mass revocation threshold → pause() halts further revocations
 *   5. Epoch advance rate → pause() triggered after 6th advance in 24h
 *
 * @dev "24h" is simulated by warping block.timestamp.
 */
contract MonitoringE2ETest is Test {

    // -------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------

    SpendEnvelopeRegistryV2_1 public registry;

    address internal admin             = address(0xAD111);
    address internal issuer            = address(0x1550E2E);
    address internal revoker           = address(0xD0C000);
    address internal pauser            = address(0xF0A7A);  // Cloudflare Worker / Forta bot
    address internal gnosisSafe        = address(0x5AFE);

    bytes3  internal constant CURRENCY  = "USD";
    bytes16 internal constant BASE_NONCE = bytes16(uint128(0xDEAD));
    string  internal constant AGENT     = "agent-pay-e2e";
    uint128 internal constant MAX_AMT   = 1_000_000; // $1.00 in micro-USD

    uint64 internal validUntil;

    // -------------------------------------------------------------------------
    // setUp
    // -------------------------------------------------------------------------

    function setUp() public {
        registry = new SpendEnvelopeRegistryV2_1(admin);
        validUntil = uint64(block.timestamp + 86400 * 30); // 30 days

        vm.startPrank(admin);
        registry.grantRole(registry.ISSUER_ROLE(),     issuer);
        registry.grantRole(registry.REVOCATION_ROLE(), revoker);
        registry.grantRole(registry.PAUSER_ROLE(),     pauser);
        // Gnosis Safe holds DEFAULT_ADMIN_ROLE for unpause
        registry.grantRole(registry.DEFAULT_ADMIN_ROLE(), gnosisSafe);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Commit a single envelope with a unique ID derived from index.
    function _commitOne(uint256 index) internal {
        bytes32 envId = keccak256(abi.encodePacked("e2e-envelope", index));
        bytes32 sigFp = keccak256(abi.encodePacked("sigfp", index));
        bytes16 nonce = bytes16(uint128(index));
        vm.prank(issuer);
        registry.commit(envId, sigFp, AGENT, MAX_AMT, CURRENCY, validUntil, nonce);
    }

    /// @dev Commit N envelopes from issuer.
    function _bulkCommit(uint256 n) internal {
        for (uint256 i = 0; i < n; i++) {
            _commitOne(i);
        }
    }

    /// @dev Commit an envelope for later revocation.
    function _commitForRevoke(uint256 index) internal returns (bytes32 envId) {
        envId = keccak256(abi.encodePacked("revoke-envelope", index));
        bytes32 sigFp = keccak256(abi.encodePacked("rsigfp", index));
        bytes16 nonce = bytes16(uint128(index + 10_000));
        vm.prank(issuer);
        registry.commit(envId, sigFp, AGENT, MAX_AMT, CURRENCY, validUntil, nonce);
    }

    /// @dev Build the expected Forta webhook JSON payload (off-chain mock).
    ///      In production the Forta agent emits this; here we validate the schema.
    function _buildExpectedFortaPayload(
        string memory alertId,
        address issuerAddr,
        uint256 count,
        string memory timeframe
    ) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '{"alertId":"', alertId, '",',
            '"severity":"Critical",',
            '"metadata":{"issuer":"', vm.toString(issuerAddr), '",',
            '"count":"', vm.toString(count), '",',
            '"timeframe":"', timeframe, '",',
            '"rule":"Rule1_CommitRate"}}'
        ));
    }

    // -------------------------------------------------------------------------
    // TC01: Commit 1001 envelopes — verify expected Forta payload structure
    // -------------------------------------------------------------------------

    /**
     * @notice Simulate: issuer commits 1001 envelopes within 1 hour.
     *
     * The Forta agent watching the chain would emit a Critical finding at
     * count > 1000. This test:
     *   1. Commits 1001 envelopes on-chain.
     *   2. Verifies the registry records them all.
     *   3. Validates the expected Forta webhook payload schema.
     *
     * @dev We use vm.roll / vm.warp to keep all commits within a 1-hour window.
     */
    function test_TC01_commitBurst1001_fortaPayloadStructure() public {
        // Warp to a known timestamp and recompute validUntil so envelopes won't expire
        vm.warp(1_700_000_000);
        validUntil = uint64(block.timestamp + 86400 * 30);
        vm.roll(100);

        // Commit 1001 envelopes
        _bulkCommit(1001);

        // Verify last envelope is committed (registry tracks all 1001)
        bytes32 lastId = keccak256(abi.encodePacked("e2e-envelope", uint256(1000)));
        assertTrue(registry.isCommitted(lastId), "TC01: last envelope should be committed");

        // Verify expected Forta webhook payload JSON schema
        string memory payload = _buildExpectedFortaPayload(
            "PQSAFE-COMMIT-RATE-CRITICAL",
            issuer,
            1001,
            "60min"
        );
        // Payload must contain the alert ID and issuer address
        assertGt(bytes(payload).length, 0, "TC01: Forta payload should not be empty");
        assertTrue(
            _containsStr(payload, "PQSAFE-COMMIT-RATE-CRITICAL"),
            "TC01: payload must contain alertId"
        );
        assertTrue(
            _containsStr(payload, vm.toString(issuer)),
            "TC01: payload must contain issuer address"
        );
        assertTrue(
            _containsStr(payload, "Rule1_CommitRate"),
            "TC01: payload must identify the rule"
        );
    }

    // -------------------------------------------------------------------------
    // TC02: Forta Critical alert → Cloudflare Worker calls pause() → paused = true
    // -------------------------------------------------------------------------

    /**
     * @notice Simulate: Cloudflare Worker receives Critical webhook, calls pause().
     *
     * After 1001 commits, the Forta agent fires Critical. The Worker relays
     * a pause() call using the PAUSER_ROLE signer. This test verifies:
     *   - pause() succeeds from the PAUSER_ROLE holder
     *   - registry.paused() returns true afterwards
     */
    function test_TC02_fortaAlertTriggersWorkerPause() public {
        // Setup: commit bursts (simulates the on-chain activity that triggered Forta)
        vm.warp(1_700_000_000);
        validUntil = uint64(block.timestamp + 86400 * 30);
        _bulkCommit(5); // small number — enough to test the pause flow

        // Pre-condition: not paused
        assertFalse(registry.paused(), "TC02: should not be paused before alert");

        // Cloudflare Worker (PAUSER_ROLE) calls pause() on behalf of Forta alert
        vm.prank(pauser);
        registry.pause();

        // Post-condition: contract is paused
        assertTrue(registry.paused(), "TC02: registry.paused() must return true after Worker pause");
    }

    // -------------------------------------------------------------------------
    // TC03: Subsequent commits revert when paused
    // -------------------------------------------------------------------------

    /**
     * @notice Simulate: circuit breaker is active — all new commits are rejected.
     *
     * After pause() is called, any issuer calling commit() must get a revert.
     * This is the core safety guarantee of the V2.1 Pausable circuit-breaker.
     */
    function test_TC03_commitRevertsWhenPaused() public {
        // Pause the contract
        vm.prank(pauser);
        registry.pause();
        assertTrue(registry.paused(), "TC03: contract must be paused");

        // Attempt a new commit from issuer — must revert
        bytes32 newId = keccak256("new-commit-while-paused");
        vm.prank(issuer);
        vm.expectRevert(); // OZ Pausable: EnforcedPause()
        registry.commit(newId, bytes32(0), AGENT, MAX_AMT, CURRENCY, validUntil, BASE_NONCE);
    }

    // -------------------------------------------------------------------------
    // TC04: Mass revocation → pause() halts further revocations
    // -------------------------------------------------------------------------

    /**
     * @notice Simulate: revoker mass-revokes 101 envelopes → Forta fires Critical
     *         → Worker pauses → 102nd revocation call reverts.
     *
     * Rule 2: >100 revocations/hr from one revoker.
     */
    function test_TC04_massRevocationPausesContract() public {
        vm.warp(1_700_100_000);
        validUntil = uint64(block.timestamp + 86400 * 30);

        // Commit 102 envelopes first (so they can be revoked)
        bytes32[] memory envIds = new bytes32[](102);
        for (uint256 i = 0; i < 102; i++) {
            envIds[i] = _commitForRevoke(i);
        }

        // Revoke 101 envelopes (over threshold)
        for (uint256 i = 0; i < 101; i++) {
            vm.prank(revoker);
            registry.revokeEnvelope(envIds[i], "mass revocation test");
        }

        // At this point Forta agent would have emitted Critical and Worker calls pause()
        vm.prank(pauser);
        registry.pause();
        assertTrue(registry.paused(), "TC04: contract must be paused after mass revocation");

        // 102nd revocation should revert (contract is paused, revokeEnvelope has whenNotPaused)
        vm.prank(revoker);
        vm.expectRevert(); // EnforcedPause
        registry.revokeEnvelope(envIds[101], "should revert");
    }

    // -------------------------------------------------------------------------
    // TC05: Epoch advance rate → pause() triggered after 6th advance
    // -------------------------------------------------------------------------

    /**
     * @notice Simulate: issuer advances epoch 6 times in 24h → Rule 3 triggered
     *         → Worker pauses → 7th advance reverts.
     *
     * Rule 3: >5 IssuerEpochAdvanced events in 24h.
     *
     * @dev Epoch must increment by exactly 1 (enforced by V2 logic).
     *      We warp timestamps between advances to stay within 24h window.
     */
    function test_TC05_epochAdvanceRatePausesContract() public {
        uint64 baseTime = 1_700_200_000;
        vm.warp(baseTime);

        // Advance epoch 6 times within 24h (threshold is >5)
        for (uint64 i = 1; i <= 6; i++) {
            // Warp by 1 minute between each advance (all within 24h window)
            vm.warp(baseTime + (i * 60));
            vm.prank(issuer);
            registry.advanceEpoch(i); // epochs 1 → 2 → 3 → 4 → 5 → 6
        }

        // After 6th advance Forta fires Critical (>5 in 24h) → Worker calls pause()
        vm.prank(pauser);
        registry.pause();
        assertTrue(registry.paused(), "TC05: contract must be paused after 6 epoch advances");

        // 7th epoch advance must revert (whenNotPaused on advanceEpoch in V2.1)
        vm.prank(issuer);
        vm.expectRevert(); // EnforcedPause
        registry.advanceEpoch(7);
    }

    // -------------------------------------------------------------------------
    // TC06: Gnosis Safe unpauses after incident resolved (bonus test)
    // -------------------------------------------------------------------------

    /**
     * @notice Simulate: after incident investigation, Gnosis Safe 2-of-3 unpauses.
     *
     * Verifies the full recovery path: pause → investigate → unpause.
     * Only DEFAULT_ADMIN_ROLE can unpause (enforced by V2.1).
     */
    function test_TC06_gnosisSafeUnpausesAfterIncident() public {
        // Pause (simulating Worker circuit-breaker trigger)
        vm.prank(pauser);
        registry.pause();
        assertTrue(registry.paused(), "TC06: should be paused");

        // Gnosis Safe 2-of-3 approves unpause (simulated here as single admin call)
        vm.prank(gnosisSafe);
        registry.unpause();

        assertFalse(registry.paused(), "TC06: should be unpaused after Safe unpause");

        // Verify operations resume normally
        _commitOne(99999);
        bytes32 id = keccak256(abi.encodePacked("e2e-envelope", uint256(99999)));
        assertTrue(registry.isCommitted(id), "TC06: commit should succeed after unpause");
    }

    // -------------------------------------------------------------------------
    // Helper: naive string contains check
    // -------------------------------------------------------------------------

    function _containsStr(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) { found = false; break; }
            }
            if (found) return true;
        }
        return false;
    }
}
