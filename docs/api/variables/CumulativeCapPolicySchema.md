[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / CumulativeCapPolicySchema

# Variable: CumulativeCapPolicySchema

> `const` **CumulativeCapPolicySchema**: `ZodObject`\<\{ `mode`: `ZodLiteral`\<`"cumulative_cap"`\>; `resetWindowSeconds`: `ZodOptional`\<`ZodNumber`\>; \}, `"strip"`, `ZodTypeAny`, \{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}, \{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}\>

Defined in: [agent-pay/src/sprint2/policy.ts:73](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/policy.ts#L73)

cumulative_cap: payments are allowed until the running total reaches
envelope.maxAmount. The hosted issuer service maintains the debit ledger.
Settlement webhooks update the running balance atomically.
