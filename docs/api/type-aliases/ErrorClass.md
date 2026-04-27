[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / ErrorClass

# Type Alias: ErrorClass

> **ErrorClass** = `"SIGNATURE"` \| `"POLICY"` \| `"TEMPORAL"` \| `"REVOCATION"` \| `"RAIL"` \| `"RATE_LIMIT"` \| `"AUTH"` \| `"INTERNAL"` \| `"NOT_IMPL"`

Defined in: [agent-pay/src/sprint2/errors.ts:46](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L46)

Broad category of error. Used for routing, alerting, and dashboard grouping.

  SIGNATURE    — cryptographic verification failures (never retriable)
  POLICY       — spend policy / allowlist / amount violations (never retriable without new envelope)
  TEMPORAL     — envelope time-window issues (may be retriable with a new envelope)
  REVOCATION   — envelope revoked at any layer (never retriable)
  RAIL         — downstream payment rail failure (may be retriable)
  RATE_LIMIT   — hosted issuer API rate limit hit (retriable after retry_after_ms)
  AUTH         — API key / authentication failure (not retriable without new credentials)
  INTERNAL     — unexpected internal error (retry with backoff, escalate if persistent)
  NOT_IMPL     — called a stub function not yet implemented (developer error)
