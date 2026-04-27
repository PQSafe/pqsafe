[**PQSafe AgentPay API Reference v0.1.0**](../../../../README.md)

***

[PQSafe AgentPay API Reference](../../../../README.md) / [Stripe](../README.md) / CreateSharedPaymentTokenParams

# Interface: CreateSharedPaymentTokenParams

Defined in: [agent-pay/src/adapters/acp.ts:136](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L136)

Parameters for creating a Shared Payment Token via the Stripe API.
Send to `POST /v1/shared_payment_tokens`.

## Properties

### agentId

> **agentId**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:142](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L142)

Agent identifier (max 64 chars)

***

### currency

> **currency**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:144](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L144)

ISO 4217 currency code for usage limit amounts

***

### customer

> **customer**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:140](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L140)

Stripe customer ID that owns the payment method (cus_*)

***

### idempotencyKey?

> `optional` **idempotencyKey?**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:151](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L151)

Optional idempotency key to prevent duplicate token creation.
Use a UUID v4 or your own order ID.

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `string`\>

Defined in: [agent-pay/src/adapters/acp.ts:153](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L153)

Optional key-value metadata (max 50 keys, 500 chars each)

***

### paymentMethod

> **paymentMethod**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:138](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L138)

Stripe payment method ID to delegate (pm_*)

***

### pqEnvelopeRequested?

> `optional` **pqEnvelopeRequested?**: `boolean`

Defined in: [agent-pay/src/adapters/acp.ts:159](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L159)

PQSafe extension: if true, Stripe API response is expected to include
a `pq_envelope` field containing the serialized SpendEnvelope.
Only set if the merchant is running a PQSafe-integrated Stripe app.

***

### usageLimits?

> `optional` **usageLimits?**: [`SharedPaymentTokenUsageLimits`](SharedPaymentTokenUsageLimits.md)

Defined in: [agent-pay/src/adapters/acp.ts:146](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L146)

Usage constraints on this token
