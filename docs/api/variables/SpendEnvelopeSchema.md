[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / SpendEnvelopeSchema

# Variable: SpendEnvelopeSchema

> `const` **SpendEnvelopeSchema**: `ZodObject`\<\{ `agent`: `ZodString`; `allowedRecipients`: `ZodArray`\<`ZodString`, `"many"`\>; `currency`: `ZodString`; `issuer`: `ZodString`; `maxAmount`: `ZodNumber`; `nonce`: `ZodString`; `rail`: `ZodOptional`\<`ZodEnum`\<\[`"airwallex"`, `"wise"`, `"stripe"`, `"usdc-base"`, `"x402"`\]\>\>; `validFrom`: `ZodNumber`; `validUntil`: `ZodNumber`; `version`: `ZodLiteral`\<`1`\>; \}, `"strip"`, `ZodTypeAny`, \{ `agent`: `string`; `allowedRecipients`: `string`[]; `currency`: `string`; `issuer`: `string`; `maxAmount`: `number`; `nonce`: `string`; `rail?`: `"airwallex"` \| `"wise"` \| `"stripe"` \| `"usdc-base"` \| `"x402"`; `validFrom`: `number`; `validUntil`: `number`; `version`: `1`; \}, \{ `agent`: `string`; `allowedRecipients`: `string`[]; `currency`: `string`; `issuer`: `string`; `maxAmount`: `number`; `nonce`: `string`; `rail?`: `"airwallex"` \| `"wise"` \| `"stripe"` \| `"usdc-base"` \| `"x402"`; `validFrom`: `number`; `validUntil`: `number`; `version`: `1`; \}\>

Defined in: [agent-pay/src/envelope.ts:33](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L33)
