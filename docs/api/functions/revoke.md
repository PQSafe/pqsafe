[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / revoke

# Function: revoke()

> **revoke**(`envelopeHash`, `reason`, `signer`): `Promise`\<[`RevocationRecord`](../interfaces/RevocationRecord.md)\>

Defined in: [agent-pay/src/sprint2/revocation.ts:449](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L449)

Revoke a specific envelope (Layer 3 — granular per-envelope revocation).

Writes a revocation record to the local store (and mock store in test mode).
On-chain commitment is out-of-band (the registry contract call is separate).

## Parameters

### envelopeHash

`string`

keccak256 of the envelope bytes (hex)

### reason

`string`

Human-readable reason (stored locally; hash stored on-chain)

### signer

`string`

Private key of the revoker (used to derive revokedBy fingerprint)

## Returns

`Promise`\<[`RevocationRecord`](../interfaces/RevocationRecord.md)\>
