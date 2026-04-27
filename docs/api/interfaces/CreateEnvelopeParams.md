[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / CreateEnvelopeParams

# Interface: CreateEnvelopeParams

Defined in: [agent-pay/src/envelope.ts:75](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L75)

## Properties

### agent

> **agent**: `string`

Defined in: [agent-pay/src/envelope.ts:77](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L77)

***

### allowedRecipients

> **allowedRecipients**: `string`[]

Defined in: [agent-pay/src/envelope.ts:80](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L80)

***

### currency

> **currency**: `string`

Defined in: [agent-pay/src/envelope.ts:79](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L79)

***

### issuer

> **issuer**: `string`

Defined in: [agent-pay/src/envelope.ts:76](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L76)

***

### maxAmount

> **maxAmount**: `number`

Defined in: [agent-pay/src/envelope.ts:78](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L78)

***

### rail?

> `optional` **rail?**: [`Rail`](../type-aliases/Rail.md)

Defined in: [agent-pay/src/envelope.ts:85](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L85)

***

### startsInSeconds?

> `optional` **startsInSeconds?**: `number`

Defined in: [agent-pay/src/envelope.ts:82](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L82)

Seconds from now before envelope activates (default: 0 = immediately)

***

### ttlSeconds?

> `optional` **ttlSeconds?**: `number`

Defined in: [agent-pay/src/envelope.ts:84](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L84)

Seconds the envelope is valid for (default: 3600 = 1 hour)
