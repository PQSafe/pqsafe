[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / PaymentRequest

# Interface: PaymentRequest

Defined in: [agent-pay/src/types.ts:28](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L28)

A payment request submitted by an agent

## Properties

### amount

> **amount**: `number`

Defined in: [agent-pay/src/types.ts:32](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L32)

Amount in the envelope's currency

***

### memo?

> `optional` **memo?**: `string`

Defined in: [agent-pay/src/types.ts:34](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L34)

Human-readable memo / reference

***

### recipient

> **recipient**: `string`

Defined in: [agent-pay/src/types.ts:30](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/types.ts#L30)

Recipient address (bank account, crypto address, etc — rail-specific)
