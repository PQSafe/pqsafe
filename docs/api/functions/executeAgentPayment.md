[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / executeAgentPayment

# Function: executeAgentPayment()

> **executeAgentPayment**(`signed`, `request`, `railConfig?`, `approvalRequest?`): `Promise`\<[`PaymentResult`](../interfaces/PaymentResult.md)\>

Defined in: [agent-pay/src/index.ts:111](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/index.ts#L111)

Verify a PQ-signed SpendEnvelope and execute the payment if all checks pass.

Checks performed (in order):
  1. ML-DSA-65 signature verification
  2. Zod schema validation
  3. Temporal validity (validFrom / validUntil)
  4. Recipient allowlist check
  5. Amount ceiling check (request.amount <= envelope.maxAmount)
  5b. Human approval gate (if approvalRequest provided, or amount >= requiresApprovalAbove)
  6. Route to rail connector

## Parameters

### signed

[`SignedEnvelope`](../interfaces/SignedEnvelope.md)

### request

[`PaymentRequest`](../interfaces/PaymentRequest.md)

### railConfig?

[`RailConfig`](../interfaces/RailConfig.md)

### approvalRequest?

[`ApprovalRequest`](../interfaces/ApprovalRequest.md)

Optional approval gate config. If omitted and amount is below any
  configured threshold, the payment executes immediately. If provided, the payment is blocked
  until a human approves via the configured channels.

## Returns

`Promise`\<[`PaymentResult`](../interfaces/PaymentResult.md)\>

## Throws

if approval is rejected

## Throws

if approval times out

## Throws

if any other check fails — payments are only attempted if ALL checks pass.
