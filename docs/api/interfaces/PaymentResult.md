[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / PaymentResult

# Interface: PaymentResult

Defined in: [agent-pay/src/types.ts:38](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L38)

Result returned by any rail connector

## Properties

### amount

> **amount**: `number`

Defined in: [agent-pay/src/types.ts:44](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L44)

Amount debited

***

### currency

> **currency**: `string`

Defined in: [agent-pay/src/types.ts:45](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L45)

***

### executedAt

> **executedAt**: `string`

Defined in: [agent-pay/src/types.ts:48](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L48)

ISO timestamp

***

### meta?

> `optional` **meta?**: `Record`\<`string`, `unknown`\>

Defined in: [agent-pay/src/types.ts:50](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L50)

Any rail-specific metadata

***

### rail

> **rail**: [`Rail`](../type-aliases/Rail.md)

Defined in: [agent-pay/src/types.ts:40](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L40)

***

### recipient

> **recipient**: `string`

Defined in: [agent-pay/src/types.ts:46](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L46)

***

### success

> **success**: `boolean`

Defined in: [agent-pay/src/types.ts:39](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L39)

***

### txId

> **txId**: `string`

Defined in: [agent-pay/src/types.ts:42](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L42)

Rail-specific transaction ID
