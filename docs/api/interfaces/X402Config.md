[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / X402Config

# Interface: X402Config

Defined in: [agent-pay/src/rails/x402.ts:58](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/x402.ts#L58)

## Properties

### fetchFn?

> `optional` **fetchFn?**: (`input`, `init?`) => `Promise`\<`Response`\>

Defined in: [agent-pay/src/rails/x402.ts:60](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/x402.ts#L60)

Custom HTTP client (defaults to global fetch)

#### Parameters

##### input

`string` \| `URL` \| `Request`

##### init?

`RequestInit`

#### Returns

`Promise`\<`Response`\>

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [agent-pay/src/rails/x402.ts:62](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/x402.ts#L62)

Timeout in ms for x402 requests (default: 30000)
