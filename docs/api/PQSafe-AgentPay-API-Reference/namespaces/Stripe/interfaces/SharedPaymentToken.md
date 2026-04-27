[**PQSafe AgentPay API Reference v0.1.0**](../../../../README.md)

***

[PQSafe AgentPay API Reference](../../../../README.md) / [Stripe](../README.md) / SharedPaymentToken

# Interface: SharedPaymentToken

Defined in: [agent-pay/src/adapters/acp.ts:98](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L98)

A Shared Payment Token — the credential Stripe issues when a user
delegates limited payment authority to an AI agent.

The token itself is an opaque reference to Stripe's vault; PQSafe treats
it as a reference that must be accompanied by a PQ signature to prove
the delegation was human-authorized.

## Properties

### active

> **active**: `boolean`

Defined in: [agent-pay/src/adapters/acp.ts:115](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L115)

Whether the token is currently active

***

### agentId

> **agentId**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:111](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L111)

Agent identifier this token was issued to

***

### amountUsed

> **amountUsed**: `number`

Defined in: [agent-pay/src/adapters/acp.ts:117](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L117)

Running total of amounts authorized so far (smallest currency unit)

***

### created

> **created**: `number`

Defined in: [agent-pay/src/adapters/acp.ts:121](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L121)

Unix timestamp of creation

***

### currency

> **currency**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:119](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L119)

ISO 4217 currency code for all monetary fields in usageLimits

***

### customer

> **customer**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:109](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L109)

The Stripe customer who owns this token (cus_*)

***

### id

> **id**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:103](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L103)

Stripe SPT identifier.

#### Example

```ts
"spt_1PXqBBGJhmH2PkSTDemoToken123"
```

***

### lastUsed

> **lastUsed**: `number` \| `null`

Defined in: [agent-pay/src/adapters/acp.ts:123](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L123)

Unix timestamp when the token was last used (null if never used)

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `string`\>

Defined in: [agent-pay/src/adapters/acp.ts:125](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L125)

Stripe-managed metadata

***

### object

> **object**: `"shared_payment_token"`

Defined in: [agent-pay/src/adapters/acp.ts:105](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L105)

Object type discriminator — always "shared_payment_token"

***

### paymentMethod

> **paymentMethod**: `string`

Defined in: [agent-pay/src/adapters/acp.ts:107](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L107)

Stripe-internal payment method the SPT draws from (pm_*)

***

### usageLimits?

> `optional` **usageLimits?**: [`SharedPaymentTokenUsageLimits`](SharedPaymentTokenUsageLimits.md)

Defined in: [agent-pay/src/adapters/acp.ts:113](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L113)

Usage constraints
