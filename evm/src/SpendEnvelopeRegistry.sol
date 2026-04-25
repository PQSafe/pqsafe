// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SpendEnvelopeRegistry
 * @notice On-chain audit ledger for PQSafe AgentPay SpendEnvelopes.
 *
 * An AI agent operator calls `commit()` before or during a payment to
 * immutably record: (a) the agent identifier, (b) the ML-DSA-65 envelope
 * hash, (c) the spend cap, (d) the expiry, and (e) a compact 32-byte
 * fingerprint of the ML-DSA-65 signature.
 *
 * Verifiers — compliance officers, auditors, counter-parties — can call
 * `isCommitted()` to confirm that a given payment was pre-authorized.
 *
 * NOTE: This contract does NOT attempt to verify ML-DSA-65 signatures
 * on-chain. Full on-chain verification is possible but expensive (~50M gas
 * for a naive Solidity port). The pattern here is:
 *   1. Operator verifies signature off-chain via @pqsafe/agent-pay SDK.
 *   2. Operator commits the envelope hash + sig fingerprint on-chain.
 *   3. Anyone can verify the commitment exists; anyone with the full
 *      envelope JSON can re-verify the ML-DSA-65 signature off-chain.
 *
 * The on-chain verifier (MLDSA65Verifier.sol) is a separate deliverable
 * that commits the full verification on-chain for use cases that require it.
 */
contract SpendEnvelopeRegistry {

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /**
     * @notice Emitted when an operator commits a SpendEnvelope to the registry.
     * @param operator    The address that committed (msg.sender)
     * @param agent       Agent identifier string (e.g. "research-agent-v1")
     * @param envelopeId  keccak256 of the envelope JSON bytes — the primary key
     * @param sigFingerprint  First 32 bytes of the ML-DSA-65 signature (hex)
     * @param maxAmount   Spend ceiling in the envelope's currency unit (scaled by 1e6)
     * @param currency    ISO 4217 currency code as bytes3 (e.g. "USD")
     * @param validUntil  Unix timestamp when the envelope expires
     * @param nonce       128-bit envelope nonce (anti-replay, from signed payload)
     */
    event EnvelopeCommitted(
        address indexed operator,
        string  indexed agent,
        bytes32 indexed envelopeId,
        bytes32         sigFingerprint,
        uint128         maxAmount,
        bytes3          currency,
        uint64          validUntil,
        bytes16         nonce
    );

    /**
     * @notice Emitted when an operator marks an envelope as used (payment executed).
     * @param envelopeId   The envelope that was used
     * @param txReference  Off-chain transaction reference (e.g. Airwallex UUID, hex-encoded)
     * @param amountUsed   Actual amount spent (≤ maxAmount)
     */
    event EnvelopeUsed(
        bytes32 indexed envelopeId,
        bytes32         txReference,
        uint128         amountUsed
    );

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    struct EnvelopeRecord {
        address operator;
        uint128 maxAmount;
        bytes3  currency;
        uint64  validUntil;
        bytes16 nonce;
        bytes32 sigFingerprint;
        bool    used;
        bytes32 txReference;  // set when marked used
        uint128 amountUsed;   // set when marked used
        uint64  committedAt;  // block.timestamp when committed
    }

    /// @dev envelopeId → record
    mapping(bytes32 => EnvelopeRecord) private _records;

    /// @dev operator → total envelopes committed (for enumeration / stats)
    mapping(address => uint256) public operatorCommitCount;

    // -------------------------------------------------------------------------
    // Core functions
    // -------------------------------------------------------------------------

    /**
     * @notice Commit a SpendEnvelope to the registry.
     *
     * The caller is the operator (wallet owner / agent supervisor).
     * Anyone can read the commitment; only the committing operator can mark
     * it as used.
     *
     * @param envelopeId     keccak256(envelopeJsonBytes) — computed off-chain
     * @param sigFingerprint bytes32(mlDsa65Signature[0:32]) — first 32 bytes of sig
     * @param agent          Agent identifier string
     * @param maxAmount      Spend ceiling (scaled by 1e6, e.g. $20.00 = 20_000_000)
     * @param currency       ISO 4217 as bytes3 (e.g. "USD", "HKD")
     * @param validUntil     Unix timestamp (seconds)
     * @param nonce          128-bit random nonce from the envelope
     */
    function commit(
        bytes32 envelopeId,
        bytes32 sigFingerprint,
        string  calldata agent,
        uint128 maxAmount,
        bytes3  currency,
        uint64  validUntil,
        bytes16 nonce
    ) external {
        require(_records[envelopeId].committedAt == 0, "PQSafe: already committed");
        require(validUntil > block.timestamp,           "PQSafe: envelope already expired");
        require(maxAmount > 0,                          "PQSafe: maxAmount must be positive");
        require(bytes(agent).length > 0,                "PQSafe: agent must be non-empty");

        _records[envelopeId] = EnvelopeRecord({
            operator:       msg.sender,
            maxAmount:      maxAmount,
            currency:       currency,
            validUntil:     validUntil,
            nonce:          nonce,
            sigFingerprint: sigFingerprint,
            used:           false,
            txReference:    bytes32(0),
            amountUsed:     0,
            committedAt:    uint64(block.timestamp)
        });

        operatorCommitCount[msg.sender]++;

        emit EnvelopeCommitted(
            msg.sender,
            agent,
            envelopeId,
            sigFingerprint,
            maxAmount,
            currency,
            validUntil,
            nonce
        );
    }

    /**
     * @notice Mark an envelope as used after payment execution.
     *
     * Only the original committing operator can mark it used.
     * Can only be called once per envelope.
     *
     * @param envelopeId   The envelope being used
     * @param txReference  Off-chain tx ID (e.g. Airwallex UUID as bytes32)
     * @param amountUsed   Actual amount charged (must be ≤ maxAmount)
     */
    function markUsed(
        bytes32 envelopeId,
        bytes32 txReference,
        uint128 amountUsed
    ) external {
        EnvelopeRecord storage rec = _records[envelopeId];
        require(rec.committedAt > 0,           "PQSafe: envelope not committed");
        require(rec.operator == msg.sender,    "PQSafe: only operator can mark used");
        require(!rec.used,                     "PQSafe: already marked used");
        require(amountUsed <= rec.maxAmount,   "PQSafe: amountUsed exceeds cap");

        rec.used         = true;
        rec.txReference  = txReference;
        rec.amountUsed   = amountUsed;

        emit EnvelopeUsed(envelopeId, txReference, amountUsed);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /**
     * @notice Check whether an envelope has been committed.
     * @return true if committed (regardless of used status)
     */
    function isCommitted(bytes32 envelopeId) external view returns (bool) {
        return _records[envelopeId].committedAt > 0;
    }

    /**
     * @notice Check whether an envelope has been used.
     */
    function isUsed(bytes32 envelopeId) external view returns (bool) {
        return _records[envelopeId].used;
    }

    /**
     * @notice Retrieve the full record for an envelope.
     */
    function getRecord(bytes32 envelopeId)
        external
        view
        returns (EnvelopeRecord memory)
    {
        return _records[envelopeId];
    }

    /**
     * @notice Compute the envelopeId from raw JSON bytes.
     * Convenience for off-chain callers to verify their hash matches.
     */
    function computeEnvelopeId(bytes calldata envelopeJsonBytes)
        external
        pure
        returns (bytes32)
    {
        return keccak256(envelopeJsonBytes);
    }
}
