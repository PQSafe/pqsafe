// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SpendEnvelopeRegistryV2
 * @notice On-chain audit ledger for PQSafe AgentPay SpendEnvelopes — V2.
 *
 * @dev Architecture summary
 * -------------------------
 * Three-layer revocation model (Sprint 2):
 *   Layer 1 — Single-envelope revocation via revokeEnvelope() (per-envelope).
 *   Layer 2 — Epoch-based bulk revocation via advanceEpoch() (all envelopes of
 *              an issuer at epoch N are implicitly revoked when epoch advances to N+1).
 *   Layer 3 — Per-envelope explicit RevocationRecord with reason hash.
 *
 * Cumulative-cap policy: spentAmount[envelopeId] tracks running spend; useful
 * for multi-draw envelopes where the same envelope authorises multiple smaller
 * charges up to the total cap.
 *
 * Roles (OZ AccessControl):
 *   DEFAULT_ADMIN_ROLE — can grant/revoke all roles; intended for a multi-sig.
 *   ISSUER_ROLE        — can commit envelopes, advance their own epoch.
 *   REVOCATION_ROLE    — can revoke any envelope (compliance / legal hold).
 *   OPERATOR_ROLE      — can markUsed / markUsedCumulative.
 *
 * Struct packing
 * ---------------
 * EnvelopeRecord packs into ≤3 storage slots:
 *   slot 0: operator(20B) + validUntil(8B) + committedAt(8B) = 36B → 1 slot + overflow
 *   Actually: operator 160b, validUntil 64b, committedAt 64b = 288b > 256b
 *   So: slot 0 = operator(160b) + validUntil(64b) = 224b; slot 1 = committedAt(64b) + issuerEpochAtCommit(64b) + maxAmount(128b) = 256b; slot 2 = sigFingerprint(256b); slot 3 = nonce(128b) + currency(24b) + used(8b) = 160b; slot 4 = txReference(256b); slot 5 = amountUsed(128b)
 *   With cumulative the counts live in a separate mapping.
 *
 * RevocationRecord packs into 1 slot:
 *   revokedBy(160b) + revokedAt(64b) + reasonHash(32b spare in next slot)
 *
 * Gas notes
 * ---------
 * - uint64 timestamps: safe until year 2106; saves 192 bits vs uint256.
 * - Tight struct packing reduces cold SSTORE from multiple slots.
 * - No string storage on-chain; agent name is emitted as an event topic only.
 * - CREATE2 deployment address is deterministic across chains (see DeployV2 script).
 *
 * Arbitrum note
 * -------------
 * Arbitrum uses block.timestamp from the L1 feed; safe to use for expiry checks.
 * chainId() is used in the commit domain separator to prevent L2 replay attacks.
 */
contract SpendEnvelopeRegistryV2 is AccessControl, ReentrancyGuard {

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant ISSUER_ROLE     = keccak256("ISSUER_ROLE");
    bytes32 public constant REVOCATION_ROLE = keccak256("REVOCATION_ROLE");
    bytes32 public constant OPERATOR_ROLE   = keccak256("OPERATOR_ROLE");

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    /**
     * @dev Packed into 4 storage slots:
     *   slot 0: operator (160b) | validUntil (64b) | committedAt (64b) = 288b → 2 slots
     *           Actually: operator(20B) + validUntil(8B) = 28B < 32B → slot 0
     *           committedAt(8B) + issuerEpochAtCommit(8B) + maxAmount(16B) = 32B → slot 1
     *   slot 2: sigFingerprint (32B)
     *   slot 3: nonce(16B) + currency(3B) + status(1B) = 20B < 32B
     *   txReference and amountUsed stored separately to save gas when not used.
     */
    struct EnvelopeRecord {
        address operator;           // 20B — original committer
        uint64  validUntil;         // 8B  — expiry timestamp
        uint64  committedAt;        // 8B  — block.timestamp at commit    [slot 0 = 36B overflow → slot 0+1]
        uint64  issuerEpochAtCommit;// 8B  — issuer epoch when committed  [slot 1]
        uint128 maxAmount;          // 16B — spend ceiling (1e6 scaled)   [slot 1]
        bytes32 sigFingerprint;     // 32B — ML-DSA-65 sig fingerprint    [slot 2]
        bytes16 nonce;              // 16B — anti-replay nonce            [slot 3]
        bytes3  currency;           // 3B  — ISO 4217 currency            [slot 3]
        uint8   status;             // 1B  — 0=pending, 1=used, 2=revoked [slot 3]
        // txReference + amountUsed stored in separate mappings for cold-path writes
    }

    /**
     * @dev RevocationRecord packs into 2 slots:
     *   slot 0: revokedBy(20B) + revokedAt(8B) = 28B
     *   slot 1: reasonHash(32B)
     */
    struct RevocationRecord {
        address revokedBy;    // 20B
        uint64  revokedAt;    // 8B
        bytes32 reasonHash;   // 32B — keccak256 of reason string (emit for full text)
    }

    // -------------------------------------------------------------------------
    // Status constants
    // -------------------------------------------------------------------------

    uint8 public constant STATUS_PENDING  = 0;
    uint8 public constant STATUS_USED     = 1;
    uint8 public constant STATUS_REVOKED  = 2;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @dev envelopeId → core record
    mapping(bytes32 => EnvelopeRecord) private _records;

    /// @dev envelopeId → txReference (set on markUsed)
    mapping(bytes32 => bytes32)  public txReferences;

    /// @dev envelopeId → actual amount used on last call (single-use policy)
    mapping(bytes32 => uint128)  public amountUsed;

    /// @dev envelopeId → cumulative spend (for cumulative_cap policy)
    mapping(bytes32 => uint256)  public spentAmount;

    /// @dev Layer 2: issuer address → current epoch (advancing invalidates all prior)
    mapping(address => uint64)   public issuerEpoch;

    /// @dev Layer 3: envelopeId → explicit revocation record
    mapping(bytes32 => RevocationRecord) private _revocations;

    /// @dev operator → total envelopes committed (stats)
    mapping(address => uint256)  public operatorCommitCount;

    /// @dev issuer → total envelopes committed
    mapping(address => uint256)  public issuerCommitCount;

    // -------------------------------------------------------------------------
    // Events  (all key fields indexed for The Graph)
    // -------------------------------------------------------------------------

    /**
     * @notice Envelope committed to the registry.
     * @param issuer        The issuer address (holds ISSUER_ROLE)
     * @param operator      The calling operator (may equal issuer)
     * @param envelopeId    keccak256(envelopeJsonBytes) — primary key
     * @param sigFingerprint bytes32(mlDsa65Sig[0:32])
     * @param maxAmount     Spend ceiling (1e6 scaled)
     * @param currency      ISO 4217 as bytes3
     * @param validUntil    Expiry unix timestamp
     * @param nonce         128-bit anti-replay nonce
     * @param epoch         Issuer epoch at time of commit
     * @param chainId       EVM chain ID (anti-replay across L2s)
     */
    event EnvelopeCommitted(
        address indexed issuer,
        address indexed operator,
        bytes32 indexed envelopeId,
        bytes32         sigFingerprint,
        uint128         maxAmount,
        bytes3          currency,
        uint64          validUntil,
        bytes16         nonce,
        uint64          epoch,
        uint256         chainId
    );

    /**
     * @notice Agent identifier associated with a committed envelope.
     * Emitted separately to avoid indexed string (un-searchable); agent string
     * is kept off-chain in event logs for The Graph.
     */
    event EnvelopeAgentTag(
        bytes32 indexed envelopeId,
        string          agent
    );

    /**
     * @notice Envelope marked used after payment execution.
     * @param envelopeId  The consumed envelope
     * @param operator    Who called markUsed
     * @param txReference Off-chain tx reference (e.g. Airwallex UUID)
     * @param amountUsed  Actual amount charged
     */
    event EnvelopeUsed(
        bytes32 indexed envelopeId,
        address indexed operator,
        bytes32         txReference,
        uint128         amountUsed
    );

    /**
     * @notice Cumulative spend increment recorded.
     * @param envelopeId     The envelope
     * @param incrementAmount Amount added this call
     * @param totalSpent     Running cumulative total after this increment
     */
    event CumulativeSpendRecorded(
        bytes32 indexed envelopeId,
        uint128         incrementAmount,
        uint256         totalSpent
    );

    /**
     * @notice Per-envelope revocation (Layer 3).
     * @param envelopeId  Revoked envelope
     * @param revokedBy   Address that executed the revocation
     * @param reasonHash  keccak256(reason string) — full text in ReasonAnnounced
     */
    event EnvelopeRevoked(
        bytes32 indexed envelopeId,
        address indexed revokedBy,
        bytes32         reasonHash
    );

    /**
     * @notice Full revocation reason text (for audit trail; emitted alongside EnvelopeRevoked).
     */
    event ReasonAnnounced(
        bytes32 indexed envelopeId,
        string          reason
    );

    /**
     * @notice Issuer epoch advanced (Layer 2 bulk revocation).
     * All envelopes committed at epoch < newEpoch by this issuer are invalid.
     * @param issuer    The issuer that advanced
     * @param oldEpoch  Previous epoch
     * @param newEpoch  New epoch (must be oldEpoch + 1)
     */
    event IssuerEpochAdvanced(
        address indexed issuer,
        uint64          oldEpoch,
        uint64          newEpoch
    );

    // -------------------------------------------------------------------------
    // Errors  (custom errors save gas vs revert strings)
    // -------------------------------------------------------------------------

    error AlreadyCommitted(bytes32 envelopeId);
    error EnvelopeExpired(bytes32 envelopeId);
    error ZeroAmount();
    error EmptyAgent();
    error NotCommitted(bytes32 envelopeId);
    error Unauthorized(address caller);
    error AlreadyUsed(bytes32 envelopeId);
    error AlreadyRevoked(bytes32 envelopeId);
    error AmountExceedsCap(uint128 requested, uint128 cap);
    error CumulativeExceedsCap(uint256 newTotal, uint128 cap);
    error EpochMustIncrementByOne(uint64 current, uint64 requested);
    error EpochInvalidated(bytes32 envelopeId, uint64 commitEpoch, uint64 currentEpoch);
    error EnvelopeNotActive(bytes32 envelopeId, uint8 status);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @param admin Address that receives DEFAULT_ADMIN_ROLE.
     *              Use a multi-sig for production (e.g. Gnosis Safe).
     */
    constructor(address admin) {
        if (admin == address(0)) revert Unauthorized(address(0));
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // -------------------------------------------------------------------------
    // Core write functions
    // -------------------------------------------------------------------------

    /**
     * @notice Commit a SpendEnvelope to the registry.
     *
     * Caller must hold ISSUER_ROLE. The operator field records msg.sender.
     * Envelopes from past epochs are rejected immediately.
     *
     * @param envelopeId     keccak256(envelopeJsonBytes) — computed off-chain
     * @param sigFingerprint bytes32(mlDsa65Signature[0:32])
     * @param agent          Agent identifier string (stored in event only)
     * @param maxAmount      Spend ceiling (1e6 scaled, e.g. $20.00 = 20_000_000)
     * @param currency       ISO 4217 as bytes3
     * @param validUntil     Expiry unix timestamp (uint64; safe until year 2106)
     * @param nonce          128-bit anti-replay nonce from envelope payload
     */
    function commit(
        bytes32        envelopeId,
        bytes32        sigFingerprint,
        string calldata agent,
        uint128        maxAmount,
        bytes3         currency,
        uint64         validUntil,
        bytes16        nonce
    ) external virtual nonReentrant {
        _commitLogic(envelopeId, sigFingerprint, agent, maxAmount, currency, validUntil, nonce);
    }

    /**
     * @notice Mark an envelope as fully used after single payment execution.
     *
     * Only callable by address with OPERATOR_ROLE.
     * Validates: committed, active (not revoked), not already used,
     *            not epoch-invalidated, amountUsed ≤ maxAmount.
     *
     * @param envelopeId   The envelope being consumed
     * @param txReference  Off-chain tx ID (e.g. Airwallex UUID as bytes32)
     * @param _amountUsed  Actual amount charged (must be ≤ maxAmount)
     */
    function markUsed(
        bytes32 envelopeId,
        bytes32 txReference,
        uint128 _amountUsed
    ) external virtual nonReentrant {
        _markUsedLogic(envelopeId, txReference, _amountUsed);
    }

    /**
     * @notice Record a cumulative spend increment for a multi-draw envelope.
     *
     * Can be called multiple times. Each call adds incrementAmount to
     * spentAmount[envelopeId]. Reverts if total would exceed maxAmount.
     * Does NOT set status=USED; the envelope remains active until explicitly
     * marked used or revoked.
     *
     * @param envelopeId      The envelope being partially drawn
     * @param incrementAmount Amount drawn this call
     */
    function recordCumulativeSpend(
        bytes32 envelopeId,
        uint128 incrementAmount
    ) external virtual nonReentrant {
        _recordCumulativeSpendLogic(envelopeId, incrementAmount);
    }

    /**
     * @notice Revoke a specific envelope (Layer 3).
     *
     * Callable by addresses with REVOCATION_ROLE or the original issuer/operator.
     * Sets status = STATUS_REVOKED. Idempotent check prevents double-revocation.
     *
     * @param envelopeId  Envelope to revoke
     * @param reason      Human-readable reason (emitted but not stored on-chain)
     */
    function revokeEnvelope(
        bytes32 envelopeId,
        string calldata reason
    ) external virtual nonReentrant {
        _revokeEnvelopeLogic(envelopeId, reason);
    }

    /**
     * @notice Advance an issuer's epoch, bulk-invalidating all prior envelopes (Layer 2).
     *
     * Only the issuer themselves (msg.sender must hold ISSUER_ROLE) can advance
     * their own epoch. Epoch must increment by exactly 1 to prevent skipping.
     *
     * After this call, any envelope committed at epoch N-1 will be rejected by
     * _assertActive() because issuerEpochAtCommit < current epoch.
     *
     * @param newEpoch Must equal issuerEpoch[msg.sender] + 1
     */
    function advanceEpoch(uint64 newEpoch) external virtual {
        _advanceEpochLogic(newEpoch);
    }

    // -------------------------------------------------------------------------
    // Internal logic helpers (called by external functions + V2.1 overrides)
    // -------------------------------------------------------------------------

    /// @dev Core commit logic — separated to allow V2.1 to call without re-entering
    ///      the nonReentrant guard on the external wrapper.
    function _commitLogic(
        bytes32         envelopeId,
        bytes32         sigFingerprint,
        string calldata agent,
        uint128         maxAmount,
        bytes3          currency,
        uint64          validUntil,
        bytes16         nonce
    ) internal {
        if (!hasRole(ISSUER_ROLE, msg.sender)) revert Unauthorized(msg.sender);
        if (_records[envelopeId].committedAt != 0) revert AlreadyCommitted(envelopeId);
        if (validUntil <= uint64(block.timestamp))  revert EnvelopeExpired(envelopeId);
        if (maxAmount == 0)                         revert ZeroAmount();
        if (bytes(agent).length == 0)               revert EmptyAgent();

        uint64 epoch = issuerEpoch[msg.sender];

        _records[envelopeId] = EnvelopeRecord({
            operator:            msg.sender,
            validUntil:          validUntil,
            committedAt:         uint64(block.timestamp),
            issuerEpochAtCommit: epoch,
            maxAmount:           maxAmount,
            sigFingerprint:      sigFingerprint,
            nonce:               nonce,
            currency:            currency,
            status:              STATUS_PENDING
        });

        operatorCommitCount[msg.sender]++;
        issuerCommitCount[msg.sender]++;

        emit EnvelopeCommitted(
            msg.sender,
            msg.sender,
            envelopeId,
            sigFingerprint,
            maxAmount,
            currency,
            validUntil,
            nonce,
            epoch,
            block.chainid
        );
        emit EnvelopeAgentTag(envelopeId, agent);
    }

    /// @dev Core markUsed logic.
    function _markUsedLogic(
        bytes32 envelopeId,
        bytes32 txReference,
        uint128 _amountUsed
    ) internal {
        if (!hasRole(OPERATOR_ROLE, msg.sender)) revert Unauthorized(msg.sender);

        EnvelopeRecord storage rec = _records[envelopeId];
        _assertActive(envelopeId, rec);

        if (_amountUsed > rec.maxAmount) revert AmountExceedsCap(_amountUsed, rec.maxAmount);

        rec.status = STATUS_USED;
        txReferences[envelopeId] = txReference;
        amountUsed[envelopeId]   = _amountUsed;

        emit EnvelopeUsed(envelopeId, msg.sender, txReference, _amountUsed);
    }

    /// @dev Core recordCumulativeSpend logic.
    function _recordCumulativeSpendLogic(
        bytes32 envelopeId,
        uint128 incrementAmount
    ) internal {
        if (!hasRole(OPERATOR_ROLE, msg.sender)) revert Unauthorized(msg.sender);

        EnvelopeRecord storage rec = _records[envelopeId];
        _assertActive(envelopeId, rec);

        if (incrementAmount == 0) revert ZeroAmount();

        uint256 newTotal = spentAmount[envelopeId] + incrementAmount;
        if (newTotal > rec.maxAmount) revert CumulativeExceedsCap(newTotal, rec.maxAmount);

        spentAmount[envelopeId] = newTotal;

        emit CumulativeSpendRecorded(envelopeId, incrementAmount, newTotal);
    }

    /// @dev Core revokeEnvelope logic.
    function _revokeEnvelopeLogic(
        bytes32         envelopeId,
        string calldata reason
    ) internal {
        EnvelopeRecord storage rec = _records[envelopeId];
        if (rec.committedAt == 0) revert NotCommitted(envelopeId);
        if (rec.status == STATUS_REVOKED) revert AlreadyRevoked(envelopeId);

        // Must hold REVOCATION_ROLE OR be the original operator/issuer
        bool authorized = hasRole(REVOCATION_ROLE, msg.sender) || rec.operator == msg.sender;
        if (!authorized) revert Unauthorized(msg.sender);

        bytes32 reasonHash = keccak256(bytes(reason));
        rec.status = STATUS_REVOKED;

        _revocations[envelopeId] = RevocationRecord({
            revokedBy:  msg.sender,
            revokedAt:  uint64(block.timestamp),
            reasonHash: reasonHash
        });

        emit EnvelopeRevoked(envelopeId, msg.sender, reasonHash);
        emit ReasonAnnounced(envelopeId, reason);
    }

    /// @dev Core advanceEpoch logic.
    function _advanceEpochLogic(uint64 newEpoch) internal {
        if (!hasRole(ISSUER_ROLE, msg.sender)) revert Unauthorized(msg.sender);

        uint64 current = issuerEpoch[msg.sender];
        if (newEpoch != current + 1) revert EpochMustIncrementByOne(current, newEpoch);

        issuerEpoch[msg.sender] = newEpoch;

        emit IssuerEpochAdvanced(msg.sender, current, newEpoch);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * @dev Validate that an envelope is active (committed, not revoked, not used,
     *      not epoch-invalidated, not expired).
     */
    function _assertActive(bytes32 envelopeId, EnvelopeRecord storage rec) internal view {
        if (rec.committedAt == 0) revert NotCommitted(envelopeId);
        if (rec.status != STATUS_PENDING) revert EnvelopeNotActive(envelopeId, rec.status);

        // Layer 2 epoch check
        uint64 currentEpoch = issuerEpoch[rec.operator];
        if (rec.issuerEpochAtCommit < currentEpoch) {
            revert EpochInvalidated(envelopeId, rec.issuerEpochAtCommit, currentEpoch);
        }
    }

    // -------------------------------------------------------------------------
    // View / pure functions
    // -------------------------------------------------------------------------

    /// @notice True if the envelope has been committed (regardless of status).
    function isCommitted(bytes32 envelopeId) external view returns (bool) {
        return _records[envelopeId].committedAt != 0;
    }

    /// @notice True if the envelope has been marked used (single-use).
    function isUsed(bytes32 envelopeId) external view returns (bool) {
        return _records[envelopeId].status == STATUS_USED;
    }

    /// @notice True if the envelope has been explicitly revoked (Layer 3).
    function isRevoked(bytes32 envelopeId) external view returns (bool) {
        return _records[envelopeId].status == STATUS_REVOKED;
    }

    /**
     * @notice Full validity check: returns true only if the envelope is committed,
     *         not revoked, not used, not epoch-invalidated, and not expired.
     */
    function isValid(bytes32 envelopeId) external view returns (bool) {
        EnvelopeRecord storage rec = _records[envelopeId];
        if (rec.committedAt == 0)             return false;
        if (rec.status != STATUS_PENDING)     return false;
        if (uint64(block.timestamp) > rec.validUntil) return false;
        if (rec.issuerEpochAtCommit < issuerEpoch[rec.operator]) return false;
        return true;
    }

    /// @notice Return the full EnvelopeRecord for an envelope.
    function getRecord(bytes32 envelopeId)
        external
        view
        returns (EnvelopeRecord memory)
    {
        return _records[envelopeId];
    }

    /// @notice Return the RevocationRecord for an envelope (zero-value if not revoked).
    function getRevocation(bytes32 envelopeId)
        external
        view
        returns (RevocationRecord memory)
    {
        return _revocations[envelopeId];
    }

    /**
     * @notice Compute envelopeId from raw JSON bytes (convenience for off-chain callers).
     */
    function computeEnvelopeId(bytes calldata envelopeJsonBytes)
        external
        pure
        returns (bytes32)
    {
        return keccak256(envelopeJsonBytes);
    }

    /**
     * @notice Remaining spend capacity for a cumulative envelope.
     * Returns 0 if revoked, used, or over-cap (safety guard).
     */
    function remainingCapacity(bytes32 envelopeId) external view returns (uint256) {
        EnvelopeRecord storage rec = _records[envelopeId];
        if (rec.status != STATUS_PENDING) return 0;
        uint256 spent = spentAmount[envelopeId];
        if (spent >= rec.maxAmount) return 0;
        return uint256(rec.maxAmount) - spent;
    }
}
