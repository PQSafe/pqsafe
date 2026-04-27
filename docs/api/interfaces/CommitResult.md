[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / CommitResult

# Interface: CommitResult

Defined in: [agent-pay/src/arbitrum.ts:37](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L37)

## Properties

### envelopeId

> **envelopeId**: `string`

Defined in: [agent-pay/src/arbitrum.ts:41](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L41)

keccak256 of the envelope JSON bytes — the on-chain primary key

***

### sigFingerprint

> **sigFingerprint**: `string`

Defined in: [agent-pay/src/arbitrum.ts:43](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L43)

First 32 bytes of the ML-DSA-65 signature (the on-chain fingerprint)

***

### txHash

> **txHash**: `string`

Defined in: [agent-pay/src/arbitrum.ts:39](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L39)

Transaction hash on Arbitrum
