[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / executeWithApproval

# Function: executeWithApproval()

> **executeWithApproval**(`signed`, `request`, `config?`): `Promise`\<[`PaymentResult`](../interfaces/PaymentResult.md)\>

Defined in: [agent-pay/src/approval.ts:893](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L893)

Execute a payment with optional human-in-the-loop approval gate.
Legacy convenience wrapper — prefer `requestApproval` + `executeAgentPayment` for new code.

- amount ≤ autoApproveThreshold → executes immediately (no approval gate)
- amount > autoApproveThreshold → approval gate via configured channels

## Parameters

### signed

[`SignedEnvelope`](../interfaces/SignedEnvelope.md)

### request

[`PaymentRequest`](../interfaces/PaymentRequest.md)

### config?

[`ApprovalConfig`](../interfaces/ApprovalConfig.md)

## Returns

`Promise`\<[`PaymentResult`](../interfaces/PaymentResult.md)\>

## Throws

if approval is rejected

## Throws

if approval times out

## Throws

if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set when required
