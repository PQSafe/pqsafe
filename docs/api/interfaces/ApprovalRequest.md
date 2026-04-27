[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / ApprovalRequest

# Interface: ApprovalRequest

Defined in: [agent-pay/src/approval.ts:117](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L117)

## Properties

### approvers

> **approvers**: [`ApprovalChannel`](ApprovalChannel.md)[]

Defined in: [agent-pay/src/approval.ts:123](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L123)

Channels to send the approval request through

***

### envelope

> **envelope**: [`SignedEnvelope`](SignedEnvelope.md)

Defined in: [agent-pay/src/approval.ts:119](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L119)

The signed envelope being approved

***

### humanReadableSummary

> **humanReadableSummary**: `string`

Defined in: [agent-pay/src/approval.ts:129](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L129)

Human-readable summary shown to approvers

***

### paymentRequest

> **paymentRequest**: [`PaymentRequest`](PaymentRequest.md)

Defined in: [agent-pay/src/approval.ts:121](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L121)

The payment request being authorized

***

### riskScore?

> `optional` **riskScore?**: `"low"` \| `"medium"` \| `"high"` \| `"critical"`

Defined in: [agent-pay/src/approval.ts:131](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L131)

Risk level — shown to approvers for context

***

### threshold?

> `optional` **threshold?**: `number`

Defined in: [agent-pay/src/approval.ts:125](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L125)

N-of-M approvals required (default: 1)

***

### timeoutSec?

> `optional` **timeoutSec?**: `number`

Defined in: [agent-pay/src/approval.ts:127](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L127)

Seconds before auto-deny (default: 600 = 10 min)
