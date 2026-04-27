[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / SpendKeyRecord

# Interface: SpendKeyRecord

Defined in: [agent-pay/src/sprint2/issuer.ts:112](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L112)

Spend key record: rotated quarterly, signs individual envelopes.

## Extends

- [`KeyRecord`](KeyRecord.md)

## Properties

### certificate

> **certificate**: [`SpendKeyCertificate`](SpendKeyCertificate.md)

Defined in: [agent-pay/src/sprint2/issuer.ts:116](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L116)

Certificate from root key authorizing this spend key.

***

### createdAt

> **createdAt**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:60](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L60)

ISO timestamp: when this key was generated.

#### Inherited from

[`KeyRecord`](KeyRecord.md).[`createdAt`](KeyRecord.md#createdat)

***

### keyId

> **keyId**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:54](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L54)

Unique key ID (UUID v4). Used in certificates and audit logs.

#### Inherited from

[`KeyRecord`](KeyRecord.md).[`keyId`](KeyRecord.md#keyid)

***

### publicKey

> **publicKey**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:58](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L58)

Hex-encoded public key bytes.

#### Inherited from

[`KeyRecord`](KeyRecord.md).[`publicKey`](KeyRecord.md#publickey)

***

### revoked

> **revoked**: `boolean`

Defined in: [agent-pay/src/sprint2/issuer.ts:66](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L66)

Whether this key has been explicitly revoked (epoch advance or root revocation).

#### Inherited from

[`KeyRecord`](KeyRecord.md).[`revoked`](KeyRecord.md#revoked)

***

### revokedAt?

> `optional` **revokedAt?**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:68](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L68)

ISO timestamp of revocation (if revoked = true).

#### Inherited from

[`KeyRecord`](KeyRecord.md).[`revokedAt`](KeyRecord.md#revokedat)

***

### rotationQuarter

> **rotationQuarter**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:118](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L118)

Quarter this key is active (e.g. "2026-Q2"). For human reference only.

***

### type

> **type**: `"spend"`

Defined in: [agent-pay/src/sprint2/issuer.ts:113](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L113)

***

### validFrom

> **validFrom**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:62](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L62)

ISO timestamp: not valid before this time.

#### Inherited from

[`KeyRecord`](KeyRecord.md).[`validFrom`](KeyRecord.md#validfrom)

***

### validUntil

> **validUntil**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:64](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L64)

ISO timestamp: not valid after this time.

#### Inherited from

[`KeyRecord`](KeyRecord.md).[`validUntil`](KeyRecord.md#validuntil)

***

### variant

> **variant**: `"ml-dsa-65"`

Defined in: [agent-pay/src/sprint2/issuer.ts:114](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L114)

ML-DSA variant for this key.

#### Overrides

[`KeyRecord`](KeyRecord.md).[`variant`](KeyRecord.md#variant)
