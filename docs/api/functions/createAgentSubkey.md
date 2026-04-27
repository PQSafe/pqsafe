[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / createAgentSubkey

# Function: createAgentSubkey()

> **createAgentSubkey**(`_issuerAddress`, `_params`, `_config`): `Promise`\<[`AgentSubkeyRecord`](../interfaces/AgentSubkeyRecord.md)\>

Defined in: [agent-pay/src/sprint2/issuer.ts:224](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L224)

Create a new agent-scoped subkey with bounded authority.

Sprint 3 implementation will:
  1. Generate ML-DSA-44 agent subkey.
  2. Associate with active spend key + agent identity.
  3. Enforce agentMaxAmount <= spendKey's effective limit.
  4. Register subkey in hosted issuer service.

## Parameters

### \_issuerAddress

`string`

### \_params

#### agentAllowedCurrencies?

`string`[]

#### agentAllowedRails?

`string`[]

#### agentId

`string`

#### agentMaxAmount

`number`

#### ttlSeconds?

`number`

### \_config

#### apiKey

`string`

#### serviceUrl

`string`

## Returns

`Promise`\<[`AgentSubkeyRecord`](../interfaces/AgentSubkeyRecord.md)\>

## Throws

'Sprint 2 — implementation queued' until Sprint 3 ships.
