[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / advanceEpoch

# Function: advanceEpoch()

> **advanceEpoch**(`issuerAddress`, `signer`): `Promise`\<[`EpochRecord`](../interfaces/EpochRecord.md)\>

Defined in: [agent-pay/src/sprint2/revocation.ts:497](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L497)

Advance the issuer epoch (Layer 2 — bulk invalidation).

Increments the epoch counter for the given issuer in the local store.
This immediately invalidates ALL envelopes signed under the previous epoch.

## Parameters

### issuerAddress

`string`

The issuer's Ethereum-style address

### signer

`string`

Private key of the issuer (used for fingerprint)

## Returns

`Promise`\<[`EpochRecord`](../interfaces/EpochRecord.md)\>
