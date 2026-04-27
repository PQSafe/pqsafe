[**PQSafe AgentPay API Reference v0.1.0**](../../../../README.md)

***

[PQSafe AgentPay API Reference](../../../../README.md) / [AP2](../README.md) / PaymentRequest

# Interface: PaymentRequest

Defined in: [agent-pay/src/adapters/ap2.ts:224](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L224)

PaymentRequest — structure sent from merchant to agent during checkout.
Mirrors the W3C Payment Request API surface used by AP2.

## Properties

### details

> **details**: `object`

Defined in: [agent-pay/src/adapters/ap2.ts:232](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L232)

Order details

#### displayItems?

> `optional` **displayItems?**: [`PaymentItem`](PaymentItem.md)[]

Itemized line items (optional)

#### label

> **label**: `string`

Human-readable order description

#### shippingOptions?

> `optional` **shippingOptions?**: `object`[]

Shipping options (optional)

#### total

> **total**: [`PaymentItem`](PaymentItem.md)

Final total to be charged

***

### expiresAt?

> `optional` **expiresAt?**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:251](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L251)

ISO 8601 expiry for the payment request

***

### merchantId

> **merchantId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:228](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L228)

Merchant identifier

***

### methodData

> **methodData**: [`PaymentMethodData`](PaymentMethodData.md)[]

Defined in: [agent-pay/src/adapters/ap2.ts:230](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L230)

Merchant-accepted payment methods

***

### requestId

> **requestId**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:226](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L226)

Unique request ID

***

### requestShipping?

> `optional` **requestShipping?**: `boolean`

Defined in: [agent-pay/src/adapters/ap2.ts:249](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L249)

Optional shipping address request
