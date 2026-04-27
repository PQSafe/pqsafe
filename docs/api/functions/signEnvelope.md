[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / signEnvelope

# Function: signEnvelope()

> **signEnvelope**(`envelope`, `dsaSecretKey`, `dsaPublicKey`): [`SignedEnvelope`](../interfaces/SignedEnvelope.md)

Defined in: [agent-pay/src/envelope.ts:127](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/envelope.ts#L127)

Sign a SpendEnvelope with the issuer's ML-DSA-65 secret key.
Returns a SignedEnvelope ready for agent use.

## Parameters

### envelope

#### agent

`string` = `...`

Agent identifier — free-form string (e.g. "raymond-ai-coo-v1", "content-officer")

#### allowedRecipients

`string`[] = `...`

Allowlist of recipients. Agent may ONLY pay to addresses in this list.
Rail-specific format (IBAN, crypto address, Stripe customer ID, etc.).
Empty array = no recipients allowed (envelope is effectively frozen).

#### currency

`string` = `...`

ISO 4217 currency code or crypto token symbol (3–5 chars)

#### issuer

`string` = `...`

PQSafe address of the human issuer (pq1 + 20-byte keccak hex)

#### maxAmount

`number` = `...`

Maximum total amount the agent may spend (in the given currency)

#### nonce

`string` = `...`

Random hex nonce (128-bit) to prevent replay attacks

#### rail?

`"airwallex"` \| `"wise"` \| `"stripe"` \| `"usdc-base"` \| `"x402"` = `...`

Optional: constrain to a single payment rail. Omit to allow router to choose.

#### validFrom

`number` = `...`

Unix timestamp (seconds) — envelope not valid before this time

#### validUntil

`number` = `...`

Unix timestamp (seconds) — envelope expires after this time

#### version

`1` = `...`

Schema version — must be 1

### dsaSecretKey

`Uint8Array`

### dsaPublicKey

`Uint8Array`

## Returns

[`SignedEnvelope`](../interfaces/SignedEnvelope.md)
