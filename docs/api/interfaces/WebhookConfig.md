[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / WebhookConfig

# Interface: WebhookConfig

Defined in: [agent-pay/src/approval.ts:62](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L62)

## Properties

### secret?

> `optional` **secret?**: `string`

Defined in: [agent-pay/src/approval.ts:66](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L66)

Shared HMAC-SHA256 secret — if set, X-PQSafe-Signature header is sent

***

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [agent-pay/src/approval.ts:68](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L68)

Timeout for the webhook response in ms (default: 30_000)

***

### url

> **url**: `string`

Defined in: [agent-pay/src/approval.ts:64](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L64)

URL to POST the approval request to
