[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / getApprovalStatus

# Function: getApprovalStatus()

> **getApprovalStatus**(`id`): `Promise`\<[`ApprovalResult`](../interfaces/ApprovalResult.md)\>

Defined in: [agent-pay/src/approval.ts:805](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L805)

Retrieve the current status of an approval request.
Returns 'pending' result if not found (may have been GC'd from in-memory store).

## Parameters

### id

`string`

## Returns

`Promise`\<[`ApprovalResult`](../interfaces/ApprovalResult.md)\>
