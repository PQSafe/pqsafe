[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / requestApproval

# Function: requestApproval()

> **requestApproval**(`req`): `Promise`\<[`ApprovalResult`](../interfaces/ApprovalResult.md)\>

Defined in: [agent-pay/src/approval.ts:672](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L672)

Request human approval for a payment across one or more channels.
Sends all channels in parallel; first valid response wins (or quorum if threshold > 1).

## Parameters

### req

[`ApprovalRequest`](../interfaces/ApprovalRequest.md)

## Returns

`Promise`\<[`ApprovalResult`](../interfaces/ApprovalResult.md)\>

## Throws

if threshold approvals are not met (more rejections than can be overcome)

## Throws

if no response within timeoutSec
