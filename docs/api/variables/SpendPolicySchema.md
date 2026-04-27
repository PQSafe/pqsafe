[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / SpendPolicySchema

# Variable: SpendPolicySchema

> `const` **SpendPolicySchema**: `ZodDiscriminatedUnion`\<`"mode"`, \[`ZodObject`\<\{ `mode`: `ZodLiteral`\<`"single_use"`\>; \}, `"strip"`, `ZodTypeAny`, \{ `mode`: `"single_use"`; \}, \{ `mode`: `"single_use"`; \}\>, `ZodObject`\<\{ `mode`: `ZodLiteral`\<`"per_tx_cap"`\>; `perTxLimit`: `ZodNumber`; \}, `"strip"`, `ZodTypeAny`, \{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \}, \{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \}\>, `ZodObject`\<\{ `mode`: `ZodLiteral`\<`"cumulative_cap"`\>; `resetWindowSeconds`: `ZodOptional`\<`ZodNumber`\>; \}, `"strip"`, `ZodTypeAny`, \{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}, \{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}\>\]\>

Defined in: [agent-pay/src/sprint2/policy.ts:88](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/policy.ts#L88)
