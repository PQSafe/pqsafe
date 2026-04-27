[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / isRevoked

# Function: isRevoked()

> **isRevoked**(`envelopeHash`, `options?`): `Promise`\<[`RevocationStatus`](../interfaces/RevocationStatus.md)\>

Defined in: [agent-pay/src/sprint2/revocation.ts:315](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L315)

Check whether an envelope has been revoked via any of the 3 layers.

Composite check order:
  1. Layer 1 — TTL / temporal expiry (local, free)
  2. Layer 2 — Issuer epoch (local cache → on-chain fallback)
  3. Layer 3 — Per-envelope record (local cache → on-chain fallback)

Modes (env-var driven):
  PQSAFE_REVOCATION_MOCK=true   → in-memory Map (unit tests)
  PQSAFE_REGISTRY_ADDRESS=0x... → try local first, fall back to on-chain
  (default)                     → local JSON file only

## Parameters

### envelopeHash

`string`

keccak256 of envelope bytes (hex, with or without 0x)

### options?

#### failOpen?

`boolean`

If true, return 'active' on check errors (low-value path)

#### issuerAddress?

`string`

Issuer address for Layer 2 epoch check

#### issuerEpoch?

`bigint`

Epoch the envelope was signed under

#### skipChain?

`boolean`

Skip on-chain reads (local cache only)

#### validUntil?

`number`

Unix timestamp (seconds) from envelope — for L1 check

## Returns

`Promise`\<[`RevocationStatus`](../interfaces/RevocationStatus.md)\>
