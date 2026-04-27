[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / getEpoch

# Function: getEpoch()

> **getEpoch**(`issuerAddress`): `Promise`\<`bigint`\>

Defined in: [agent-pay/src/sprint2/revocation.ts:536](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L536)

Get the current epoch for an issuer address.

Check order: mock store → local JSON file → on-chain (if PQSAFE_REGISTRY_ADDRESS set).

## Parameters

### issuerAddress

`string`

The issuer's Ethereum-style address

## Returns

`Promise`\<`bigint`\>
