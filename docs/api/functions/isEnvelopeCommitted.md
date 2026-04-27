[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / isEnvelopeCommitted

# Function: isEnvelopeCommitted()

> **isEnvelopeCommitted**(`envelopeJson`, `config`): `Promise`\<`boolean`\>

Defined in: [agent-pay/src/arbitrum.ts:272](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/arbitrum.ts#L272)

Check if an envelope is already committed on-chain (read-only, no gas).

## Parameters

### envelopeJson

`string`

### config

#### contractAddress

`string`

#### keccak256

(`d`) => `Uint8Array`

#### rpcUrl

`string`

## Returns

`Promise`\<`boolean`\>
