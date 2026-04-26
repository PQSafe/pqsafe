// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Pausable.sol";
import "./SpendEnvelopeRegistryV2.sol";

/**
 * @title SpendEnvelopeRegistryV2_1
 * @notice V2.1 extension of SpendEnvelopeRegistryV2 — adds Pausable circuit-breaker.
 *
 * @dev What changed vs V2
 * ----------------------
 * 1. Inherits OpenZeppelin Pausable (OZ v5.3.0).
 * 2. New role: PAUSER_ROLE — held by Forta auto-pause bot / monitoring address.
 * 3. pause()   — callable by PAUSER_ROLE only.
 * 4. unpause() — callable by DEFAULT_ADMIN_ROLE only (Gnosis Safe 2-of-3 multi-sig
 *    handles key management externally; this contract enforces the role gate).
 * 5. whenNotPaused modifier applied to all state-changing functions:
 *    commit(), markUsed(), recordCumulativeSpend(), revokeEnvelope(), advanceEpoch().
 *
 * Inheritance chain
 * -----------------
 * SpendEnvelopeRegistryV2_1
 *   └─ SpendEnvelopeRegistryV2
 *        ├─ AccessControl (OZ v5)
 *        └─ ReentrancyGuard (OZ v5)
 *   └─ Pausable (OZ v5)
 *        └─ Context (OZ v5)
 *
 * Why V2.1 not V3?
 * ----------------
 * Pausable is storage-compatible with V2. OZ's Pausable appends a single `bool _paused`
 * to the contract's storage. All V2 storage slots remain at identical positions.
 * No existing mappings or counters change address. Customers can hot-swap V2 → V2.1
 * by deploying fresh and re-issuing active envelopes (Option A in the migration
 * playbook). V3 is reserved for breaking storage changes (new fields, new schemas).
 *
 * Storage layout additions (relative to V2)
 * ------------------------------------------
 * All V2 slots: unchanged (SpendEnvelopeRegistryV2 base).
 * Pausable adds: bool _paused (1 bool packed into 1 slot appended after all V2 state).
 *
 * Override pattern
 * ----------------
 * V2's external functions delegate to internal `_*Logic` helpers. V2.1 overrides the
 * external entry points to prepend `whenNotPaused`, then calls the same `_*Logic`
 * internal functions directly. This is the only Solidity-correct way to layer a modifier
 * onto an `external virtual` function across contract inheritance, since `super` cannot
 * call `external` functions from within a contract.
 *
 * Gas impact
 * ----------
 * Each whenNotPaused check adds ~2 100 gas (one SLOAD for _paused, one conditional
 * branch). Acceptable for the circuit-breaker safety guarantee.
 *
 * Roles
 * -----
 *   DEFAULT_ADMIN_ROLE  — grant/revoke all roles; unpause; intended for Gnosis Safe.
 *   ISSUER_ROLE         — commit envelopes, advance their own epoch.
 *   REVOCATION_ROLE     — revoke any envelope.
 *   OPERATOR_ROLE       — markUsed / recordCumulativeSpend.
 *   PAUSER_ROLE  (NEW)  — pause the contract (circuit-breaker trigger).
 *
 * Deployment recommendation
 * --------------------------
 * Deploy V2.1 as the canonical production contract. Skip V2 mainnet deploy entirely.
 * V2 remains the audit reference / Sepolia educational deployment.
 */
contract SpendEnvelopeRegistryV2_1 is SpendEnvelopeRegistryV2, Pausable {

    // -------------------------------------------------------------------------
    // New role
    // -------------------------------------------------------------------------

    /// @notice Role that can trigger an emergency pause.
    ///         Intended for the Forta monitoring bot or a PQSafe ops address.
    ///         Granting this role to an automated system is intentional — the
    ///         threat model assumes pause is cheap and false-positives are
    ///         recoverable by the DEFAULT_ADMIN_ROLE multi-sig via unpause().
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // -------------------------------------------------------------------------
    // Custom errors
    // -------------------------------------------------------------------------

    /// @dev Raised when a non-ADMIN address tries to call unpause().
    error UnpauseRequiresAdmin(address caller);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param admin Address that receives DEFAULT_ADMIN_ROLE.
     *              Production: use a Gnosis Safe 2-of-3 multi-sig.
     */
    constructor(address admin) SpendEnvelopeRegistryV2(admin) {
        // Pausable initialises _paused = false — no extra init needed.
    }

    // -------------------------------------------------------------------------
    // Circuit-breaker controls
    // -------------------------------------------------------------------------

    /**
     * @notice Trigger an emergency pause. Freezes all state-changing functions.
     *
     * Only callable by an address holding PAUSER_ROLE.
     * Designed for automated circuit-breaker triggers (Forta bot, monitoring
     * alert webhook). Emits OZ `Paused(address account)`.
     *
     * @dev Delegates to OZ's internal `_pause()`:
     *      1. Reverts if already paused (EnforcedPause).
     *      2. Sets _paused = true.
     *      3. Emits Paused(msg.sender).
     */
    function pause() external {
        if (!hasRole(PAUSER_ROLE, msg.sender)) revert Unauthorized(msg.sender);
        _pause();
    }

    /**
     * @notice Resume normal operation after a pause.
     *
     * Only callable by DEFAULT_ADMIN_ROLE (production: Gnosis Safe 2-of-3).
     * Requiring ADMIN (not PAUSER) means a compromised monitoring bot cannot
     * cycle pause/unpause. Recovery requires deliberate multi-sig action.
     *
     * Emits OZ `Unpaused(address account)`.
     *
     * @dev Delegates to OZ's internal `_unpause()`:
     *      1. Reverts if not paused (ExpectedPause).
     *      2. Sets _paused = false.
     *      3. Emits Unpaused(msg.sender).
     */
    function unpause() external {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert UnpauseRequiresAdmin(msg.sender);
        _unpause();
    }

    // -------------------------------------------------------------------------
    // State-changing function overrides — prepend whenNotPaused gate
    // -------------------------------------------------------------------------

    /**
     * @notice Commit a SpendEnvelope. Reverts when contract is paused.
     * @dev Overrides V2's external function; adds whenNotPaused before calling
     *      the shared internal logic. nonReentrant is re-applied here.
     */
    function commit(
        bytes32         envelopeId,
        bytes32         sigFingerprint,
        string calldata agent,
        uint128         maxAmount,
        bytes3          currency,
        uint64          validUntil,
        bytes16         nonce
    ) external override whenNotPaused nonReentrant {
        _commitLogic(envelopeId, sigFingerprint, agent, maxAmount, currency, validUntil, nonce);
    }

    /**
     * @notice Mark an envelope used. Reverts when contract is paused.
     * @dev nonReentrant re-applied here.
     */
    function markUsed(
        bytes32 envelopeId,
        bytes32 txReference,
        uint128 _amountUsed
    ) external override whenNotPaused nonReentrant {
        _markUsedLogic(envelopeId, txReference, _amountUsed);
    }

    /**
     * @notice Record cumulative spend. Reverts when contract is paused.
     * @dev nonReentrant re-applied here.
     */
    function recordCumulativeSpend(
        bytes32 envelopeId,
        uint128 incrementAmount
    ) external override whenNotPaused nonReentrant {
        _recordCumulativeSpendLogic(envelopeId, incrementAmount);
    }

    /**
     * @notice Revoke an envelope. Reverts when contract is paused.
     * @dev nonReentrant re-applied here.
     */
    function revokeEnvelope(
        bytes32         envelopeId,
        string calldata reason
    ) external override whenNotPaused nonReentrant {
        _revokeEnvelopeLogic(envelopeId, reason);
    }

    /**
     * @notice Advance issuer epoch. Reverts when contract is paused.
     */
    function advanceEpoch(uint64 newEpoch) external override whenNotPaused {
        _advanceEpochLogic(newEpoch);
    }
}
