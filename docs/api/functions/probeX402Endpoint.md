[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / probeX402Endpoint

# Function: probeX402Endpoint()

> **probeX402Endpoint**(`url`, `fetchFn?`): `Promise`\<[`X402PaymentRequirements`](../interfaces/X402PaymentRequirements.md) \| `null`\>

Defined in: [agent-pay/src/rails/x402.ts:232](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/rails/x402.ts#L232)

Check if a URL endpoint supports x402 payments.
Returns the payment requirements if supported, null otherwise.

## Parameters

### url

`string`

### fetchFn?

(`input`, `init?`) => `Promise`\<`Response`\>

## Returns

`Promise`\<[`X402PaymentRequirements`](../interfaces/X402PaymentRequirements.md) \| `null`\>
