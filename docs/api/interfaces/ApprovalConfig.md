[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / ApprovalConfig

# Interface: ApprovalConfig

Defined in: [agent-pay/src/approval.ts:839](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L839)

## Properties

### autoApproveThreshold?

> `optional` **autoApproveThreshold?**: `number`

Defined in: [agent-pay/src/approval.ts:845](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L845)

Payments ≤ this amount execute without approval. Default: Infinity (all autonomous)

***

### onApprovalResult?

> `optional` **onApprovalResult?**: (`info`, `approved`) => `void`

Defined in: [agent-pay/src/approval.ts:851](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L851)

Called when operator approves or rejects

#### Parameters

##### info

[`ApprovalInfo`](ApprovalInfo.md)

##### approved

`boolean`

#### Returns

`void`

***

### onApprovalSent?

> `optional` **onApprovalSent?**: (`info`) => `void`

Defined in: [agent-pay/src/approval.ts:849](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L849)

Called when approval is sent — useful for logging/telemetry

#### Parameters

##### info

[`ApprovalInfo`](ApprovalInfo.md)

#### Returns

`void`

***

### telegramBotToken?

> `optional` **telegramBotToken?**: `string`

Defined in: [agent-pay/src/approval.ts:841](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L841)

Telegram bot token from

#### Bot Father

***

### telegramChatId?

> `optional` **telegramChatId?**: `string`

Defined in: [agent-pay/src/approval.ts:843](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L843)

Chat ID to send approval requests to (personal DM, group, or channel)

***

### timeoutSeconds?

> `optional` **timeoutSeconds?**: `number`

Defined in: [agent-pay/src/approval.ts:847](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L847)

Seconds to wait for approval before rejecting. Default: 300 (5 min)
