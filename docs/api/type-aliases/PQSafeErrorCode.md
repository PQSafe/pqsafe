[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / PQSafeErrorCode

# Type Alias: PQSafeErrorCode

> **PQSafeErrorCode** = `"SIGNATURE_INVALID"` \| `"SIGNATURE_KEY_MISMATCH"` \| `"SIGNATURE_MALFORMED"` \| `"POLICY_RECIPIENT_NOT_ALLOWED"` \| `"POLICY_AMOUNT_EXCEEDS_CEILING"` \| `"POLICY_AMOUNT_EXCEEDS_PER_TX_CAP"` \| `"POLICY_CUMULATIVE_CAP_EXHAUSTED"` \| `"POLICY_SINGLE_USE_ALREADY_SPENT"` \| `"POLICY_RAIL_NOT_ALLOWED"` \| `"POLICY_CURRENCY_MISMATCH"` \| `"ENVELOPE_NOT_YET_ACTIVE"` \| `"ENVELOPE_EXPIRED"` \| `"REVOKED_EPOCH_ADVANCED"` \| `"REVOKED_GRANULAR"` \| `"REVOCATION_CHECK_FAILED_CLOSED"` \| `"RAIL_CONNECTION_FAILED"` \| `"RAIL_PAYMENT_DECLINED"` \| `"RAIL_SETTLEMENT_PENDING"` \| `"RAIL_UNSUPPORTED"` \| `"RAIL_RECIPIENT_INVALID"` \| `"RATE_LIMIT_ISSUER_API"` \| `"RATE_LIMIT_ENVELOPE_CREATION"` \| `"AUTH_API_KEY_INVALID"` \| `"AUTH_API_KEY_REVOKED"` \| `"AUTH_INSUFFICIENT_SCOPE"` \| `"INTERNAL_SCHEMA_INVALID"` \| `"INTERNAL_UNEXPECTED"` \| `"NOT_IMPLEMENTED"`

Defined in: [agent-pay/src/sprint2/errors.ts:65](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L65)

Fine-grained error code. Each code maps to exactly one ErrorClass.
Codes are stable identifiers — safe for programmatic matching.
