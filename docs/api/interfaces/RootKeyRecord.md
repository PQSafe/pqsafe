[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / RootKeyRecord

# Interface: RootKeyRecord

Defined in: [agent-pay/src/sprint2/issuer.ts:75](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L75)

Root key record. The secret key never leaves the HSM.
Only the public key and metadata are stored in this record.

## Extends

- [`KeyRecord`](KeyRecord.md)

## Properties

### createdAt

> **createdAt**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:60](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L60)

ISO timestamp: when this key was generated.

#### Inherited from

[`KeyRecord`](KeyRecord.md).[`createdAt`](KeyRecord.md#createdat)

***

### hsmProvider

> **hsmProvider**: `"yubikey"` \| `"aws-cloudhsm"` \| `"google-cloud-kms"` \| `"software-dev-only"`

Defined in: [agent-pay/src/sprint2/issuer.ts:87](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L87)

HSM provider used in production.
'yubikey' or 'cloud-hsm' acceptable for v1.

***

### issuerAddress

> **issuerAddress**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:82](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L82)

PQSafe issuer address derived from this root key.
pq1 + keccak256(publicKey)[0:20] as hex.

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

### type

> **type**: `"root"`

Defined in: [agent-pay/src/sprint2/issuer.ts:76](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L76)

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

> **variant**: `"ml-dsa-87"`

Defined in: [agent-pay/src/sprint2/issuer.ts:77](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L77)

ML-DSA variant for this key.

#### Overrides

[`KeyRecord`](KeyRecord.md).[`variant`](KeyRecord.md#variant)
