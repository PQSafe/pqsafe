[**PQSafe AgentPay API Reference v0.1.0**](../../../../README.md)

***

[PQSafe AgentPay API Reference](../../../../README.md) / [AP2](../README.md) / CartMandate

# Interface: CartMandate

Defined in: [agent-pay/src/adapters/ap2.ts:143](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L143)

Cart Mandate — mid-flow mandate with a concrete list of items.
Issued after the agent has added items to a cart but before checkout.

## Properties

### acceptedMethods?

> `optional` **acceptedMethods?**: [`PaymentMethodData`](PaymentMethodData.md)[]

Defined in: [agent-pay/src/adapters/ap2.ts:169](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L169)

Optional list of accepted payment methods

***

### agentId

> **agentId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:165](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L165)

Agent identifier

***

### currency

> **currency**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:161](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L161)

Currency for all monetary fields

***

### expiresAt

> **expiresAt**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:163](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L163)

ISO 8601 expiry datetime for this mandate

***

### issuerAddress

> **issuerAddress**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:167](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L167)

Issuer PQSafe address

***

### items

> **items**: [`PaymentItem`](PaymentItem.md)[]

Defined in: [agent-pay/src/adapters/ap2.ts:151](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L151)

Line items in the cart

***

### mandateId

> **mandateId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:147](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L147)

Unique mandate ID (UUID v4 recommended)

***

### merchantId

> **merchantId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:149](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L149)

Merchant/service identifier

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [agent-pay/src/adapters/ap2.ts:173](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L173)

Optional arbitrary metadata

***

### shipping?

> `optional` **shipping?**: `number`

Defined in: [agent-pay/src/adapters/ap2.ts:157](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L157)

Optional shipping amount

***

### shippingAddress?

> `optional` **shippingAddress?**: [`ContactAddress`](ContactAddress.md)

Defined in: [agent-pay/src/adapters/ap2.ts:171](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L171)

Optional buyer shipping address

***

### subtotal

> **subtotal**: `number`

Defined in: [agent-pay/src/adapters/ap2.ts:153](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L153)

Subtotal (sum of item amounts * quantities)

***

### tax?

> `optional` **tax?**: `number`

Defined in: [agent-pay/src/adapters/ap2.ts:155](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L155)

Optional tax amount

***

### total

> **total**: `number`

Defined in: [agent-pay/src/adapters/ap2.ts:159](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L159)

Grand total (subtotal + tax + shipping)

***

### type

> **type**: `"cart"`

Defined in: [agent-pay/src/adapters/ap2.ts:145](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L145)

Mandate type discriminator
