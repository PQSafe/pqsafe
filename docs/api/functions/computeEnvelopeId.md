[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / computeEnvelopeId

# Function: computeEnvelopeId()

> **computeEnvelopeId**(`envelopeJson`, `keccak256Fn`): `string`

Defined in: [agent-pay/src/arbitrum.ts:92](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L92)

Compute the on-chain envelopeId (keccak256 of envelope JSON bytes).
Requires a keccak256 implementation injected via ArbitrumRegistryConfig.

## Parameters

### envelopeJson

`string`

### keccak256Fn

(`data`) => `Uint8Array`

## Returns

`string`
