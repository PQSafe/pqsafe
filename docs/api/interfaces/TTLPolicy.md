[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / TTLPolicy

# Interface: TTLPolicy

Defined in: [agent-pay/src/sprint2/ttl\_policy.ts:15](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/ttl_policy.ts#L15)

Sprint 2 — TTL policy by amount tier.

Returns recommended validFrom / validUntil offsets (in seconds from "now")
and the revocation layer coverage appropriate for the payment amount.

Tiers (all amounts treated as USD equivalent):
  < $5        → 5 minutes   (Layer 1 only)
  $5–$100     → 30 minutes  (Layer 1 + Layer 2)
  $100–$1000  → 24 hours    (all 3 layers)
  $1000–$10000 → 4 hours    (all 3 layers + multi-sig recommended)
  > $10000    → 1 hour      (all 3 layers + 2-of-3 multi-sig required)

## Properties

### layer

> **layer**: `"L1"` \| `"L2"` \| `"L3"`

Defined in: [agent-pay/src/sprint2/ttl\_policy.ts:21](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/ttl_policy.ts#L21)

Revocation layer coverage: L1=TTL only, L2=+epoch, L3=+per-envelope registry.

***

### multiSigRecommended?

> `optional` **multiSigRecommended?**: `boolean`

Defined in: [agent-pay/src/sprint2/ttl\_policy.ts:23](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/ttl_policy.ts#L23)

Whether 2-of-3 multi-sig is recommended (non-binding advisory).

***

### multiSigRequired?

> `optional` **multiSigRequired?**: `boolean`

Defined in: [agent-pay/src/sprint2/ttl\_policy.ts:25](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/ttl_policy.ts#L25)

Whether 2-of-3 multi-sig is required (enforced by policy).

***

### validFromOffset

> **validFromOffset**: `number`

Defined in: [agent-pay/src/sprint2/ttl\_policy.ts:17](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/ttl_policy.ts#L17)

Offset in seconds from "now" before the envelope becomes active. Always 0.

***

### validUntilOffset

> **validUntilOffset**: `number`

Defined in: [agent-pay/src/sprint2/ttl\_policy.ts:19](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/ttl_policy.ts#L19)

Offset in seconds from "now" until the envelope expires.
