[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / encodeTransferCalldata

# Function: encodeTransferCalldata()

> **encodeTransferCalldata**(`to`, `amount`): `string`

Defined in: [agent-pay/src/rails/usdc-base.ts:168](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/usdc-base.ts#L168)

Encode ERC-20 transfer(address,uint256) calldata.
Returns 0x-prefixed hex string.

## Parameters

### to

`string`

### amount

`bigint`

## Returns

`string`
