[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / AgentSubkeyRecord

# Interface: AgentSubkeyRecord

Defined in: [agent-pay/src/sprint2/issuer.ts:125](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L125)

Agent subkey record: scoped to a single agent identity.
Signs envelopes on behalf of the agent; bounded by agentMaxAmount.

## Extends

- [`KeyRecord`](KeyRecord.md)

## Properties

### agentAllowedCurrencies

> **agentAllowedCurrencies**: `string`[]

Defined in: [agent-pay/src/sprint2/issuer.ts:139](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L139)

ISO 4217 currencies this subkey is permitted to sign. Empty = all currencies.

***

### agentAllowedRails

> **agentAllowedRails**: `string`[]

Defined in: [agent-pay/src/sprint2/issuer.ts:141](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L141)

Rails this subkey is permitted to sign. Empty = all rails.

***

### agentId

> **agentId**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:129](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L129)

Agent identifier this subkey is scoped to.

***

### agentMaxAmount

> **agentMaxAmount**: `number`

Defined in: [agent-pay/src/sprint2/issuer.ts:137](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L137)

Maximum amount this subkey can authorize per envelope.
Enforced by the hosted issuer service during envelope creation.
Verifiers MUST reject envelopes where amount > agentMaxAmount for agent subkeys.

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

### parentSpendKeyId

> **parentSpendKeyId**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:131](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L131)

Parent spend key ID that derived this subkey.

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

> **type**: `"agent"`

Defined in: [agent-pay/src/sprint2/issuer.ts:126](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L126)

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

> **variant**: `"ml-dsa-44"`

Defined in: [agent-pay/src/sprint2/issuer.ts:127](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L127)

ML-DSA variant for this key.

#### Overrides

[`KeyRecord`](KeyRecord.md).[`variant`](KeyRecord.md#variant)
