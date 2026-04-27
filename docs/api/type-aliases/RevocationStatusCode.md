[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / RevocationStatusCode

# Type Alias: RevocationStatusCode

> **RevocationStatusCode** = `"active"` \| `"revoked"` \| `"epoch_invalidated"` \| `"expired"` \| `"unknown"`

Defined in: [agent-pay/src/sprint2/revocation.ts:58](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L58)

Result status string for revocation check.

  'active'             — envelope is not revoked; proceed.
  'revoked'            — explicitly revoked (Layer 3 record exists).
  'epoch_invalidated'  — issuer epoch advanced beyond envelope epoch (Layer 2).
  'expired'            — envelope TTL has passed (Layer 1 / temporal).
  'unknown'            — check inconclusive; failOpen policy governs result.
