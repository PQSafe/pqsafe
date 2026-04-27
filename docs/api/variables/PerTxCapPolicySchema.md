[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / PerTxCapPolicySchema

# Variable: PerTxCapPolicySchema

> `const` **PerTxCapPolicySchema**: `ZodObject`\<\{ `mode`: `ZodLiteral`\<`"per_tx_cap"`\>; `perTxLimit`: `ZodNumber`; \}, `"strip"`, `ZodTypeAny`, \{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \}, \{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \}\>

Defined in: [agent-pay/src/sprint2/policy.ts:58](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/policy.ts#L58)

per_tx_cap: each individual payment must be <= perTxLimit.
The envelope may be presented multiple times until it expires or is revoked.
Requires the hosted issuer service to track nonce state.
