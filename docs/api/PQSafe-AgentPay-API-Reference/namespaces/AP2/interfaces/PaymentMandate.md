[**PQSafe AgentPay API Reference v0.1.0**](../../../../README.md)

***

[PQSafe AgentPay API Reference](../../../../README.md) / [AP2](../README.md) / PaymentMandate

# Interface: PaymentMandate

Defined in: [agent-pay/src/adapters/ap2.ts:180](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L180)

Payment Mandate — final checkout stage with committed payment method.
Issued when the agent is ready to execute a specific payment.

## Properties

### agentId

> **agentId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:200](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L200)

Agent identifier

***

### amount

> **amount**: `number`

Defined in: [agent-pay/src/adapters/ap2.ts:188](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L188)

Committed payment amount

***

### billingAddress?

> `optional` **billingAddress?**: [`ContactAddress`](ContactAddress.md)

Defined in: [agent-pay/src/adapters/ap2.ts:204](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L204)

Optional buyer billing address

***

### currency

> **currency**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:190](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L190)

Currency

***

### expiresAt

> **expiresAt**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:198](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L198)

ISO 8601 expiry datetime for this mandate

***

### issuerAddress

> **issuerAddress**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:202](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L202)

Issuer PQSafe address

***

### items?

> `optional` **items?**: [`PaymentItem`](PaymentItem.md)[]

Defined in: [agent-pay/src/adapters/ap2.ts:194](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L194)

Line items (optional at payment stage; may be omitted for subscriptions)

***

### mandateId

> **mandateId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:184](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L184)

Unique mandate ID (UUID v4 recommended)

***

### merchantId

> **merchantId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:186](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L186)

Merchant/service identifier

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [agent-pay/src/adapters/ap2.ts:210](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L210)

Optional arbitrary metadata

***

### paymentMethod

> **paymentMethod**: [`PaymentMethodData`](PaymentMethodData.md)

Defined in: [agent-pay/src/adapters/ap2.ts:192](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L192)

Selected payment method

***

### purchaseReference?

> `optional` **purchaseReference?**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:208](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L208)

Optional purchase reference (order ID, invoice number, etc.)

***

### recipientAddress

> **recipientAddress**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:196](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L196)

Merchant recipient address (IBAN, EVM address, Stripe customer ID, etc.)

***

### shippingAddress?

> `optional` **shippingAddress?**: [`ContactAddress`](ContactAddress.md)

Defined in: [agent-pay/src/adapters/ap2.ts:206](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L206)

Optional buyer shipping address

***

### type

> **type**: `"payment"`

Defined in: [agent-pay/src/adapters/ap2.ts:182](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L182)

Mandate type discriminator
