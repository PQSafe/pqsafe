[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / SpendKeyCertificate

# Interface: SpendKeyCertificate

Defined in: [agent-pay/src/sprint2/issuer.ts:95](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L95)

Spend key certificate: issued by root key to a spend key.
Carried in the envelope's keyChain field (Sprint 3+).
Allows a verifier to check: root_key -> spend_key -> envelope.

## Properties

### epoch

> **epoch**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:106](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L106)

Epoch this spend key was issued under. Must match the issuer's current epoch.

***

### issuedAt

> **issuedAt**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:103](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L103)

***

### rootKeyId

> **rootKeyId**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:101](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L101)

***

### rootPublicKey

> **rootPublicKey**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:102](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L102)

***

### rootSignature

> **rootSignature**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:100](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L100)

ML-DSA-87 signature by the root key over the canonical cert payload.

***

### spendKeyId

> **spendKeyId**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:97](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L97)

The spend key record this certificate is for.

***

### spendKeyPublicKey

> **spendKeyPublicKey**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:98](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L98)

***

### validUntil

> **validUntil**: `string`

Defined in: [agent-pay/src/sprint2/issuer.ts:104](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L104)
