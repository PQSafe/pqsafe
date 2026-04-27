[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / resolveApproval

# Function: resolveApproval()

> **resolveApproval**(`requestId`, `approved`, `approverIdentifier`): `boolean`

Defined in: [agent-pay/src/approval.ts:824](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L824)

Programmatically resolve a pending approval (used by Slack App action handlers
and webhook receivers to deliver the decision back to the SDK).

## Parameters

### requestId

`string`

The approval request ID

### approved

`boolean`

true = approved, false = rejected

### approverIdentifier

`string`

Identifier of the approver (e.g. "user@example.com")

## Returns

`boolean`

true if the request was found and resolved; false if already resolved or not found
