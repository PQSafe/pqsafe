[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / KeyRecord

# Interface: KeyRecord

Defined in: [agent-pay/src/sprint2/issuer.ts:52](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L52)

Common fields shared by all key records.

## Extended by

- [`RootKeyRecord`](RootKeyRecord.md)
- [`SpendKeyRecord`](SpendKeyRecord.md)
- [`AgentSubkeyRecord`](AgentSubkeyRecord.md)

## Properties

### createdAt

> **createdAt**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:60](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L60)

ISO timestamp: when this key was generated.

***

### keyId

> **keyId**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:54](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L54)

Unique key ID (UUID v4). Used in certificates and audit logs.

***

### publicKey

> **publicKey**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:58](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L58)

Hex-encoded public key bytes.

***

### revoked

> **revoked**: `boolean`

Defined in: [agent-pay/src/sprint2/issuer.ts:66](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L66)

Whether this key has been explicitly revoked (epoch advance or root revocation).

***

### revokedAt?

> `optional` **revokedAt?**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:68](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L68)

ISO timestamp of revocation (if revoked = true).

***

### validFrom

> **validFrom**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:62](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L62)

ISO timestamp: not valid before this time.

***

### validUntil

> **validUntil**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:64](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L64)

ISO timestamp: not valid after this time.

***

### variant

> **variant**: [`MLDSAVariant`](../type-aliases/MLDSAVariant.md)

Defined in: [agent-pay/src/sprint2/issuer.ts:56](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L56)

ML-DSA variant for this key.
