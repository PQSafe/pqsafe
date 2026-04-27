[**PQSafe AgentPay API Reference v0.1.0**](../../../../README.md)

***

[PQSafe AgentPay API Reference](../../../../README.md) / [AP2](../README.md) / PaymentItem

# Interface: PaymentItem

Defined in: [agent-pay/src/adapters/ap2.ts:53](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L53)

A payment item within a cart or order.

Mirrors `PaymentItem` in the W3C Payment Request API and AP2 spec.

## Properties

### amount

> **amount**: `number`

Defined in: [agent-pay/src/adapters/ap2.ts:57](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L57)

Per-unit amount

***

### category?

> `optional` **category?**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:65](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L65)

Optional item category (e.g. "physical", "digital", "service")

***

### currency

> **currency**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:59](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L59)

ISO 4217 currency code

***

### label

> **label**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:55](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L55)

Human-readable item label

***

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `unknown`\>

Defined in: [agent-pay/src/adapters/ap2.ts:67](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L67)

Optional merchant-specific metadata

***

### quantity?

> `optional` **quantity?**: `number`

Defined in: [agent-pay/src/adapters/ap2.ts:61](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L61)

Optional item quantity (default 1)

***

### sku?

> `optional` **sku?**: `string`

Defined in: [agent-pay/src/adapters/ap2.ts:63](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L63)

Optional SKU or product identifier
