[**PQSafe AgentPay API Reference v0.1.0**](../../../../README.md)

***

[PQSafe AgentPay API Reference](../../../../README.md) / [AP2](../README.md) / IntentMandate

# Interface: IntentMandate

Defined in: [agent-pay/src/adapters/ap2.ts:112](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L112)

Intent Mandate — earliest stage of agentic commerce.
Issued when the agent has expressed purchase intent but has not yet
committed to a specific cart or price.

Analogous to a pre-authorization request.

## Properties

### acceptedMethods?

> `optional` **acceptedMethods?**: [`PaymentMethodData`](PaymentMethodData.md)[]

Defined in: [agent-pay/src/adapters/ap2.ts:132](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L132)

Optional list of accepted payment methods

***

### agentId

> **agentId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:128](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L128)

Agent identifier (matches SpendEnvelope.agent)

***

### currency

> **currency**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:124](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L124)

Currency for maxAmount

***

### description

> **description**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:120](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L120)

Human-readable description of the intent

***

### expiresAt

> **expiresAt**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:126](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L126)

ISO 8601 expiry datetime for this mandate

***

### issuerAddress

> **issuerAddress**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:130](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L130)

Issuer PQSafe address (matches SpendEnvelope.issuer)

***

### mandateId

> **mandateId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:116](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L116)

Unique mandate ID (UUID v4 recommended)

***

### maxAmount

> **maxAmount**: `number`

Defined in: [agent-pay/src/adapters/ap2.ts:122](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L122)

Maximum amount the agent is authorized to spend for this intent

***

### merchantId

> **merchantId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:118](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L118)

Merchant/service identifier

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [agent-pay/src/adapters/ap2.ts:136](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L136)

Optional arbitrary merchant metadata

***

### shippingAddress?

> `optional` **shippingAddress?**: [`ContactAddress`](ContactAddress.md)

Defined in: [agent-pay/src/adapters/ap2.ts:134](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L134)

Optional buyer shipping address

***

### type

> **type**: `"intent"`

Defined in: [agent-pay/src/adapters/ap2.ts:114](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L114)

Mandate type discriminator
