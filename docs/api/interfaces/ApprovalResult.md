[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / ApprovalResult

# Interface: ApprovalResult

Defined in: [agent-pay/src/approval.ts:134](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L134)

## Properties

### approvedAt

> **approvedAt**: `number`

Defined in: [agent-pay/src/approval.ts:139](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L139)

Unix ms when final decision was reached (or 0 if pending/expired)

***

### approvedBy

> **approvedBy**: `string`[]

Defined in: [agent-pay/src/approval.ts:136](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L136)

***

### auditLog

> **auditLog**: [`ApprovalAuditEntry`](ApprovalAuditEntry.md)[]

Defined in: [agent-pay/src/approval.ts:140](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L140)

***

### rejectedBy

> **rejectedBy**: `string`[]

Defined in: [agent-pay/src/approval.ts:137](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L137)

***

### status

> **status**: `"expired"` \| `"pending"` \| `"approved"` \| `"rejected"`

Defined in: [agent-pay/src/approval.ts:135](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L135)
