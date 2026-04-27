[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / createEnvelope

# Function: createEnvelope()

> **createEnvelope**(`params`): `object`

Defined in: [agent-pay/src/envelope.ts:92](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L92)

Build a new (unsigned) SpendEnvelope.
Nonce is generated with crypto.getRandomValues for collision resistance.

## Parameters

### params

[`CreateEnvelopeParams`](../interfaces/CreateEnvelopeParams.md)

## Returns

### agent

> **agent**: `string`

Agent identifier — free-form string (e.g. "raymond-ai-coo-v1", "content-officer")

### allowedRecipients

> **allowedRecipients**: `string`[]

Allowlist of recipients. Agent may ONLY pay to addresses in this list.
Rail-specific format (IBAN, crypto address, Stripe customer ID, etc.).
Empty array = no recipients allowed (envelope is effectively frozen).

### currency

> **currency**: `string`

ISO 4217 currency code or crypto token symbol (3–5 chars)

### issuer

> **issuer**: `string`

PQSafe address of the human issuer (pq1 + 20-byte keccak hex)

### maxAmount

> **maxAmount**: `number`

Maximum total amount the agent may spend (in the given currency)

### nonce

> **nonce**: `string`

Random hex nonce (128-bit) to prevent replay attacks

### rail?

> `optional` **rail?**: `"airwallex"` \| `"wise"` \| `"stripe"` \| `"usdc-base"` \| `"x402"`

Optional: constrain to a single payment rail. Omit to allow router to choose.

### validFrom

> **validFrom**: `number`

Unix timestamp (seconds) — envelope not valid before this time

### validUntil

> **validUntil**: `number`

Unix timestamp (seconds) — envelope expires after this time

### version

> **version**: `1`

Schema version — must be 1
