[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / amountExceedsCeilingError

# Function: amountExceedsCeilingError()

> **amountExceedsCeilingError**(`requested`, `ceiling`, `currency`): [`PolicyError`](../classes/PolicyError.md)

Defined in: [agent-pay/src/sprint2/errors.ts:350](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/errors.ts#L350)

Create a PolicyError for amount exceeding envelope ceiling.

## Parameters

### requested

`number`

### ceiling

`number`

### currency

`string`

## Returns

[`PolicyError`](../classes/PolicyError.md)
