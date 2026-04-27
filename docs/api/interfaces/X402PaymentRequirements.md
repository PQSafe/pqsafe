[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / X402PaymentRequirements

# Interface: X402PaymentRequirements

Defined in: [agent-pay/src/rails/x402.ts:43](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/x402.ts#L43)

## Properties

### amount?

> `optional` **amount?**: `string`

Defined in: [agent-pay/src/rails/x402.ts:51](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/x402.ts#L51)

Amount in token atomic units

***

### maxTimeoutSeconds?

> `optional` **maxTimeoutSeconds?**: `number`

Defined in: [agent-pay/src/rails/x402.ts:55](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/x402.ts#L55)

Maximum age in seconds for a valid payment

***

### network

> **network**: `string`

Defined in: [agent-pay/src/rails/x402.ts:47](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/x402.ts#L47)

Network (e.g. "base-mainnet", "base-sepolia")

***

### scheme

> **scheme**: `string`

Defined in: [agent-pay/src/rails/x402.ts:45](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/x402.ts#L45)

Payment scheme: "exact" is the standard

***

### to

> **to**: `string`

Defined in: [agent-pay/src/rails/x402.ts:53](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/x402.ts#L53)

Recipient address

***

### tokenAddress?

> `optional` **tokenAddress?**: `string`

Defined in: [agent-pay/src/rails/x402.ts:49](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/x402.ts#L49)

Token contract address for payment
