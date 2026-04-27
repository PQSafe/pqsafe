[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / ApprovalAuditEntry

# Interface: ApprovalAuditEntry

Defined in: [agent-pay/src/approval.ts:103](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L103)

## Properties

### approvalRequestId

> **approvalRequestId**: `string`

Defined in: [agent-pay/src/approval.ts:105](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L105)

sha256 of canonical request bytes

***

### approverIdentifier

> **approverIdentifier**: `string`

Defined in: [agent-pay/src/approval.ts:107](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L107)

Approver identifier (telegram user_id, slack user, email, webhook caller)

***

### channel

> **channel**: `"telegram"` \| `"slack"` \| `"email"` \| `"webhook"` \| `"discord"` \| `"sms"` \| `"whatsapp"`

Defined in: [agent-pay/src/approval.ts:108](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L108)

***

### decision

> **decision**: `"error"` \| `"expired"` \| `"approved"` \| `"rejected"`

Defined in: [agent-pay/src/approval.ts:111](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L111)

***

### meta?

> `optional` **meta?**: `string`

Defined in: [agent-pay/src/approval.ts:114](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L114)

Raw response metadata from channel (stringified)

***

### responseTimeMs

> **responseTimeMs**: `number`

Defined in: [agent-pay/src/approval.ts:112](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L112)

***

### timestamp

> **timestamp**: `number`

Defined in: [agent-pay/src/approval.ts:110](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L110)

Unix ms
