[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / SingleUsePolicySchema

# Variable: SingleUsePolicySchema

> `const` **SingleUsePolicySchema**: `ZodObject`\<\{ `mode`: `ZodLiteral`\<`"single_use"`\>; \}, `"strip"`, `ZodTypeAny`, \{ `mode`: `"single_use"`; \}, \{ `mode`: `"single_use"`; \}\>

Defined in: [agent-pay/src/sprint2/policy.ts:48](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/policy.ts#L48)

single_use: one payment, then the nonce is burned.
No extra fields required.
