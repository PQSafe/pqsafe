// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SpendEnvelopeRegistryV2_1} from "../../src/SpendEnvelopeRegistryV2_1.sol";
import {SpendEnvelopeRegistryV2}   from "../../src/SpendEnvelopeRegistryV2.sol";

/**
 * @title E2EAnvilTest
 * @notice End-to-end rehearsal for the Arbitrum Sepolia deploy.
 *
 * This test deploys V2.1 to the local Anvil node (or fork) exactly as
 * the real Sepolia deploy will, then exercises the full lifecycle:
 *
 *   deploy → grant roles → commit envelope → markUsed
 *          → revokeEnvelope (different envelope) → advanceEpoch
 *          → pause → unpause → verify state
 *
 * Running this test before the live Sepolia deploy gives confidence that:
 *   1. The deploy script constructor args are correct.
 *   2. Role grants work as expected.
 *   3. The full lifecycle works against a freshly-deployed V2.1.
 *   4. Gas costs are within expected bounds for Arbitrum.
 *
 * RUN:
 *   cd ~/Projects/pqsafe/evm
 *   forge test --match-contract E2EAnvilTest -vv
 *
 * FORK MODE (simulates real Arbitrum Sepolia state):
 *   forge test --match-contract E2EAnvilTest -vv \
 *     --fork-url $ARB_SEPOLIA_RPC
 *
 * GAS REPORT:
 *   forge test --match-contract E2EAnvilTest -vv --gas-report
 */
contract E2EAnvilTest is Test {

    // -------------------------------------------------------------------------
    // Addresses (mirrors DeployV2_1_Sepolia.s.sol)
    // -------------------------------------------------------------------------

    address internal admin       = address(0xA0_1);  // Raymond's testnet wallet (EOA, not Safe)
    address internal testIssuer  = address(0xA0_2);  // Test issuer (AI agent operator)
    address internal testPauser  = address(0xA0_B0); // Test pauser (Forta bot simulation)
    address internal testOperator = address(0xA0_3); // Payment executor service
    address internal testRevoker = address(0xA0_4);  // Compliance officer

    // Mirrors DeployV2_1_Sepolia.s.sol
    bytes32 internal constant DEPLOY_SALT =
        keccak256("PQSafe.SpendEnvelopeRegistryV2_1.v2.1.0.sepolia");

    SpendEnvelopeRegistryV2_1 internal registry;

    // -------------------------------------------------------------------------
    // setUp: mirrors DeployV2_1_Sepolia.s.sol exactly
    // -------------------------------------------------------------------------

    function setUp() public {
        console.log("=== E2E Deploy Rehearsal ===");
        console.log("Deploying SpendEnvelopeRegistryV2_1...");

        // Deploy with same CREATE2 salt as the real script
        registry = new SpendEnvelopeRegistryV2_1{salt: DEPLOY_SALT}(admin);

        console.log("Deployed to:", address(registry));

        // Replicate the role grants from the deploy script
        vm.startPrank(admin);
        registry.grantRole(registry.ISSUER_ROLE(),  testIssuer);
        registry.grantRole(registry.PAUSER_ROLE(),  testPauser);
        // These roles are granted post-deploy in real life
        registry.grantRole(registry.OPERATOR_ROLE(),   testOperator);
        registry.grantRole(registry.REVOCATION_ROLE(), testRevoker);
        vm.stopPrank();

        console.log("Roles granted. Registry ready.");
    }

    // -------------------------------------------------------------------------
    // E2E-1: Verify initial state matches expected post-deploy state
    // -------------------------------------------------------------------------

    function test_e2e_1_initial_state() public view {
        console.log("--- E2E-1: Initial state ---");

        // Not paused
        assertFalse(registry.paused(), "should not be paused at deploy");

        // Roles assigned correctly
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin),       "admin missing");
        assertTrue(registry.hasRole(registry.ISSUER_ROLE(),        testIssuer),  "issuer missing");
        assertTrue(registry.hasRole(registry.PAUSER_ROLE(),        testPauser),  "pauser missing");
        assertTrue(registry.hasRole(registry.OPERATOR_ROLE(),      testOperator),"operator missing");
        assertTrue(registry.hasRole(registry.REVOCATION_ROLE(),    testRevoker), "revoker missing");

        // Admin does NOT have ISSUER by default (separation of concerns)
        assertFalse(registry.hasRole(registry.ISSUER_ROLE(), admin), "admin should not have ISSUER");

        console.log("PASS: initial state correct");
    }

    // -------------------------------------------------------------------------
    // E2E-2: Full lifecycle — commit -> markUsed
    // -------------------------------------------------------------------------

    function test_e2e_2_commit_and_markUsed() public {
        console.log("--- E2E-2: commit -> markUsed ---");

        bytes32 envelopeId  = keccak256('{"version":2,"agent":"test-agent","maxAmount":50000000}');
        bytes32 sigFp       = keccak256("ml-dsa-sig-fingerprint-placeholder");
        uint128 maxAmount   = 50_000_000; // $50.00 USD
        bytes3  currency    = "USD";
        uint64  validUntil  = uint64(block.timestamp + 3600);
        bytes16 nonce       = bytes16(uint128(0xDEADBEEF));

        // Commit
        vm.prank(testIssuer);
        vm.expectEmit(true, true, true, false);
        emit SpendEnvelopeRegistryV2.EnvelopeCommitted(
            testIssuer, testIssuer, envelopeId,
            sigFp, maxAmount, currency, validUntil, nonce,
            0, block.chainid
        );
        registry.commit(envelopeId, sigFp, "test-agent", maxAmount, currency, validUntil, nonce);

        assertTrue(registry.isCommitted(envelopeId), "envelope not committed");
        assertTrue(registry.isValid(envelopeId),     "envelope not valid");
        assertFalse(registry.isUsed(envelopeId),     "should not be used yet");

        console.log("PASS: commit()");

        // markUsed
        bytes32 txRef      = keccak256("airwallex-payment-tx-001");
        uint128 usedAmount = 35_000_000; // $35.00

        vm.prank(testOperator);
        vm.expectEmit(true, true, false, true);
        emit SpendEnvelopeRegistryV2.EnvelopeUsed(envelopeId, testOperator, txRef, usedAmount);
        registry.markUsed(envelopeId, txRef, usedAmount);

        assertTrue(registry.isUsed(envelopeId), "envelope not marked used");
        assertEq(registry.amountUsed(envelopeId), usedAmount, "wrong amount used");
        assertEq(registry.txReferences(envelopeId), txRef,    "wrong txRef");

        console.log("PASS: markUsed()");
    }

    // -------------------------------------------------------------------------
    // E2E-3: recordCumulativeSpend (multi-draw envelope)
    // -------------------------------------------------------------------------

    function test_e2e_3_cumulativeSpend() public {
        console.log("--- E2E-3: recordCumulativeSpend (multi-draw) ---");

        bytes32 envelopeId = keccak256("multi-draw-envelope-001");
        uint128 maxAmount  = 100_000_000; // $100.00

        vm.prank(testIssuer);
        registry.commit(
            envelopeId,
            keccak256("fp2"),
            "test-agent-multidraw",
            maxAmount,
            "USD",
            uint64(block.timestamp + 3600),
            bytes16(uint128(0xABCD1234))
        );

        // Three draws: $30 + $40 + $30 = $100
        vm.prank(testOperator);
        registry.recordCumulativeSpend(envelopeId, 30_000_000);
        assertEq(registry.spentAmount(envelopeId), 30_000_000);
        assertEq(registry.remainingCapacity(envelopeId), 70_000_000);

        vm.prank(testOperator);
        registry.recordCumulativeSpend(envelopeId, 40_000_000);
        assertEq(registry.spentAmount(envelopeId), 70_000_000);

        vm.prank(testOperator);
        registry.recordCumulativeSpend(envelopeId, 30_000_000);
        assertEq(registry.spentAmount(envelopeId), 100_000_000);
        assertEq(registry.remainingCapacity(envelopeId), 0);

        // Fourth draw should revert (would exceed cap)
        vm.prank(testOperator);
        vm.expectRevert();
        registry.recordCumulativeSpend(envelopeId, 1);

        console.log("PASS: recordCumulativeSpend() multi-draw lifecycle");
    }

    // -------------------------------------------------------------------------
    // E2E-4: revokeEnvelope
    // -------------------------------------------------------------------------

    function test_e2e_4_revoke() public {
        console.log("--- E2E-4: revokeEnvelope ---");

        bytes32 envelopeId = keccak256("envelope-to-revoke");

        vm.prank(testIssuer);
        registry.commit(
            envelopeId,
            keccak256("fp3"),
            "test-agent",
            10_000_000,
            "USD",
            uint64(block.timestamp + 3600),
            bytes16(uint128(0x9999))
        );

        string memory reason = "AML flag: suspicious counterparty";
        vm.prank(testRevoker);
        registry.revokeEnvelope(envelopeId, reason);

        assertTrue(registry.isRevoked(envelopeId), "envelope not revoked");
        assertFalse(registry.isValid(envelopeId),  "revoked envelope should be invalid");

        SpendEnvelopeRegistryV2.RevocationRecord memory rev = registry.getRevocation(envelopeId);
        assertEq(rev.revokedBy,  testRevoker);
        assertEq(rev.reasonHash, keccak256(bytes(reason)));

        console.log("PASS: revokeEnvelope()");
    }

    // -------------------------------------------------------------------------
    // E2E-5: advanceEpoch (bulk invalidation)
    // -------------------------------------------------------------------------

    function test_e2e_5_advanceEpoch() public {
        console.log("--- E2E-5: advanceEpoch (bulk invalidation) ---");

        bytes32 oldEnvelopeId = keccak256("old-epoch-envelope");

        vm.prank(testIssuer);
        registry.commit(
            oldEnvelopeId,
            keccak256("fp4"),
            "test-agent",
            5_000_000,
            "USD",
            uint64(block.timestamp + 3600),
            bytes16(uint128(0x1111))
        );

        assertTrue(registry.isValid(oldEnvelopeId), "should be valid before epoch advance");
        assertEq(registry.issuerEpoch(testIssuer), 0);

        // Advance epoch — invalidates all epoch-0 envelopes
        vm.prank(testIssuer);
        registry.advanceEpoch(1);
        assertEq(registry.issuerEpoch(testIssuer), 1);

        // Old envelope is now invalid (epoch mismatch)
        assertFalse(registry.isValid(oldEnvelopeId), "old envelope should be epoch-invalidated");

        // New envelope at epoch 1 is valid
        bytes32 newEnvelopeId = keccak256("new-epoch-1-envelope");
        vm.prank(testIssuer);
        registry.commit(
            newEnvelopeId,
            keccak256("fp5"),
            "test-agent",
            5_000_000,
            "USD",
            uint64(block.timestamp + 3600),
            bytes16(uint128(0x2222))
        );
        assertTrue(registry.isValid(newEnvelopeId), "new epoch-1 envelope should be valid");

        console.log("PASS: advanceEpoch()");
    }

    // -------------------------------------------------------------------------
    // E2E-6: Pause circuit-breaker (Forta bot simulation)
    // -------------------------------------------------------------------------

    function test_e2e_6_pause_circuit_breaker() public {
        console.log("--- E2E-6: Pause / Unpause circuit-breaker ---");

        // Normal operation first
        bytes32 envId = keccak256("env-before-pause");
        vm.prank(testIssuer);
        registry.commit(
            envId,
            keccak256("fp6"),
            "test-agent",
            1_000_000,
            "USD",
            uint64(block.timestamp + 3600),
            bytes16(uint128(0x3333))
        );

        // Forta bot triggers pause
        assertFalse(registry.paused());
        vm.prank(testPauser);
        registry.pause();
        assertTrue(registry.paused(), "should be paused");

        // All state-changing calls revert while paused
        vm.prank(testIssuer);
        vm.expectRevert();
        registry.commit(
            keccak256("blocked-during-pause"),
            keccak256("fp7"),
            "test-agent",
            1_000_000,
            "USD",
            uint64(block.timestamp + 3600),
            bytes16(uint128(0x4444))
        );

        vm.prank(testOperator);
        vm.expectRevert();
        registry.markUsed(envId, bytes32(0), 500_000);

        console.log("PASS: state-changing calls revert while paused");

        // Read-only calls still work while paused
        assertTrue(registry.isCommitted(envId), "read-only should work while paused");
        assertTrue(registry.isValid(envId),     "isValid read-only should work");

        // Admin unpauses (multi-sig in production)
        vm.prank(admin);
        registry.unpause();
        assertFalse(registry.paused(), "should be unpaused");

        // Operations resume normally
        vm.prank(testOperator);
        registry.markUsed(envId, keccak256("tx-post-unpause"), 500_000);
        assertTrue(registry.isUsed(envId), "markUsed should work after unpause");

        console.log("PASS: operations resume after unpause");
    }

    // -------------------------------------------------------------------------
    // E2E-7: Gas cost validation (Arbitrum Sepolia budget check)
    // -------------------------------------------------------------------------

    function test_e2e_7_gas_costs() public {
        console.log("--- E2E-7: Gas costs ---");

        bytes32 envId    = keccak256("gas-test-envelope");
        bytes32 sigFp    = keccak256("gas-sig-fp");
        uint128 maxAmt   = 50_000_000;
        uint64  exp      = uint64(block.timestamp + 3600);
        bytes16 nonce    = bytes16(uint128(0x6A5673A56A5673A5));

        // commit()
        uint256 g0 = gasleft();
        vm.prank(testIssuer);
        registry.commit(envId, sigFp, "test-agent", maxAmt, "USD", exp, nonce);
        uint256 gasCommit = g0 - gasleft();

        // markUsed()
        uint256 g1 = gasleft();
        vm.prank(testOperator);
        registry.markUsed(envId, keccak256("gas-tx-ref"), 25_000_000);
        uint256 gasMarkUsed = g1 - gasleft();

        // advanceEpoch() (on a fresh epoch)
        uint256 g2 = gasleft();
        vm.prank(testIssuer);
        registry.advanceEpoch(1);
        uint256 gasEpoch = g2 - gasleft();

        console.log("Gas: commit()        =", gasCommit);
        console.log("Gas: markUsed()      =", gasMarkUsed);
        console.log("Gas: advanceEpoch()  =", gasEpoch);

        // Arbitrum gas limits — generous bounds (Arbitrum L2 gas is ~100x cheaper in USD)
        // These bounds are for gas units, not cost. At 0.1 gwei/unit on Arbitrum:
        //   commit(200k) = 200,000 * 0.1 gwei = 0.00002 ETH ≈ negligible
        assertLt(gasCommit,   210_000, "commit gas exceeds 210k - check V2.1 whenNotPaused overhead");
        assertLt(gasMarkUsed, 110_000, "markUsed gas exceeds 110k");
        assertLt(gasEpoch,     60_000, "advanceEpoch gas exceeds 60k");

        console.log("PASS: all gas costs within bounds");
        console.log("NOTE: Arbitrum Sepolia estimated deploy cost ~0.001-0.005 ETH testnet");
    }

    // -------------------------------------------------------------------------
    // E2E-8: SDK integration simulation (subprocess placeholder)
    // -------------------------------------------------------------------------

    /**
     * @notice Simulates what the TypeScript SDK does: compute envelope ID off-chain
     *         then commit it on-chain. Validates the keccak256 matches.
     *
     * In real Sepolia testing, this would be a subprocess call to:
     *   node -e "const {canonicalJsonBytes} = require('./agent-pay/src/canonical'); ..."
     *
     * We simulate it here in pure Solidity for the Foundry suite.
     */
    function test_e2e_8_sdk_envelope_id_roundtrip() public {
        console.log("--- E2E-8: SDK envelope ID roundtrip ---");

        // Simulated canonical JSON produced by TypeScript SDK
        bytes memory canonicalJson = bytes(
            '{"agent":"agent-pay-v2.1","currency":"USD","maxAmount":100000000,"nonce":"0x1234abcd","validUntil":9999999999,"version":2}'
        );

        // SDK computes: keccak256(canonicalJson)
        bytes32 envelopeId = keccak256(canonicalJson);

        // Contract has computeEnvelopeId() for verification
        bytes32 contractComputed = registry.computeEnvelopeId(canonicalJson);
        assertEq(envelopeId, contractComputed, "SDK and contract envelope IDs must match");

        console.log("PASS: SDK envelope ID matches contract computeEnvelopeId()");
        console.log("Envelope ID:");
        console.logBytes32(envelopeId);
    }
}
