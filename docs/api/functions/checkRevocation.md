[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / checkRevocation

# ~~Function: checkRevocation()~~

> **checkRevocation**(`request`, `_config`): `Promise`\<\{ `failOpen?`: `boolean`; `layer?`: `2` \| `1` \| `3`; `reason?`: `string`; `revoked`: `boolean`; `revokedAt?`: `string`; \}\>

Defined in: [agent-pay/src/sprint2/revocation.ts:566](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/revocation.ts#L566)

Legacy check function accepting a RevocationCheckRequest + RevocationServiceConfig.
Delegates to the new isRevoked() function. Maintained for backward compat.

## Parameters

### request

[`RevocationCheckRequest`](../interfaces/RevocationCheckRequest.md)

### \_config

[`RevocationServiceConfig`](../interfaces/RevocationServiceConfig.md)

## Returns

`Promise`\<\{ `failOpen?`: `boolean`; `layer?`: `2` \| `1` \| `3`; `reason?`: `string`; `revoked`: `boolean`; `revokedAt?`: `string`; \}\>

## Deprecated

Use isRevoked(envelopeHash, options) instead.
