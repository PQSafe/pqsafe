[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / rotateSpendKey

# Function: rotateSpendKey()

> **rotateSpendKey**(`_issuerAddress`, `_config`): `Promise`\<[`SpendKeyRecord`](../interfaces/SpendKeyRecord.md)\>

Defined in: [agent-pay/src/sprint2/issuer.ts:206](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/issuer.ts#L206)

Rotate the active spend key (advance to next quarterly key).

Sprint 3 implementation will:
  1. Generate new ML-DSA-65 spend key.
  2. Sign new spend key certificate with root key (requires HSM interaction).
  3. Advance issuer epoch on-chain (invalidates all envelopes from old epoch).
  4. Old spend key remains in hierarchy for historical verification.

## Parameters

### \_issuerAddress

`string`

### \_config

#### apiKey

`string`

#### serviceUrl

`string`

## Returns

`Promise`\<[`SpendKeyRecord`](../interfaces/SpendKeyRecord.md)\>

## Throws

'Sprint 2 — implementation queued' until Sprint 3 ships.
