[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / SpendEnvelopeExtV2Schema

# Variable: SpendEnvelopeExtV2Schema

> `const` **SpendEnvelopeExtV2Schema**: `ZodObject`\<\{ `clientRequestId`: `ZodOptional`\<`ZodString`\>; `spendPolicy`: `ZodOptional`\<`ZodDiscriminatedUnion`\<`"mode"`, \[`ZodObject`\<\{ `mode`: `ZodLiteral`\<`"single_use"`\>; \}, `"strip"`, `ZodTypeAny`, \{ `mode`: `"single_use"`; \}, \{ `mode`: `"single_use"`; \}\>, `ZodObject`\<\{ `mode`: `ZodLiteral`\<`"per_tx_cap"`\>; `perTxLimit`: `ZodNumber`; \}, `"strip"`, `ZodTypeAny`, \{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \}, \{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \}\>, `ZodObject`\<\{ `mode`: `ZodLiteral`\<`"cumulative_cap"`\>; `resetWindowSeconds`: `ZodOptional`\<`ZodNumber`\>; \}, `"strip"`, `ZodTypeAny`, \{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}, \{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}\>\]\>\>; \}, `"strip"`, `ZodTypeAny`, \{ `clientRequestId?`: `string`; `spendPolicy?`: \{ `mode`: `"single_use"`; \} \| \{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \} \| \{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}; \}, \{ `clientRequestId?`: `string`; `spendPolicy?`: \{ `mode`: `"single_use"`; \} \| \{ `mode`: `"per_tx_cap"`; `perTxLimit`: `number`; \} \| \{ `mode`: `"cumulative_cap"`; `resetWindowSeconds?`: `number`; \}; \}\>

Defined in: [agent-pay/src/sprint2/policy.ts:115](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/sprint2/policy.ts#L115)

The additional fields that Sprint 2 adds to SpendEnvelope.
These are OPTIONAL so Sprint 1 envelopes remain valid (no migration needed).

Usage (Sprint 2 production):
  const SpendEnvelopeV2Schema = SpendEnvelopeSchema.merge(SpendEnvelopeExtV2Schema)

Until Sprint 2 production lands, these fields are accepted but not enforced.
