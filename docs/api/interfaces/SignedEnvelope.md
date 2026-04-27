[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / SignedEnvelope

# Interface: SignedEnvelope

Defined in: [agent-pay/src/types.ts:18](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L18)

Signed spend envelope ready for agent use

## Properties

### dsaPublicKey

> **dsaPublicKey**: `string`

Defined in: [agent-pay/src/types.ts:24](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L24)

ML-DSA-65 public key of the issuer, hex-encoded

***

### envelopeJson

> **envelopeJson**: `string`

Defined in: [agent-pay/src/types.ts:20](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L20)

The canonical JSON of the envelope (UTF-8 encoded, deterministic)

***

### signature

> **signature**: `string`

Defined in: [agent-pay/src/types.ts:22](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L22)

ML-DSA-65 signature over envelopeJson bytes, hex-encoded
