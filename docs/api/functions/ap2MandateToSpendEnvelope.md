[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / ap2MandateToSpendEnvelope

# Function: ap2MandateToSpendEnvelope()

> **ap2MandateToSpendEnvelope**(`mandate`, `issuerAddress`, `ttlSeconds?`): `object`

Defined in: [agent-pay/src/adapters/ap2.ts:351](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L351)

Convert an AP2 mandate (Intent, Cart, or Payment) to a PQSafe SpendEnvelope.

The adapter extracts the authorization bounds from the mandate and maps them
to SpendEnvelope fields:
  - `IntentMandate.maxAmount` → `SpendEnvelope.maxAmount`
  - `CartMandate.total` / `PaymentMandate.amount` → `SpendEnvelope.maxAmount`
  - `PaymentMandate.recipientAddress` → `SpendEnvelope.allowedRecipients`
  - `mandate.currency` → `SpendEnvelope.currency`
  - `mandate.agentId` → `SpendEnvelope.agent`
  - `mandate.expiresAt` (ISO 8601) → `SpendEnvelope.validUntil` (Unix seconds)

For IntentMandate and CartMandate, `allowedRecipients` defaults to a single
placeholder derived from `merchantId` — the caller must replace this with
the final recipient address before signing.

## Parameters

### mandate

[`AnyMandate`](../PQSafe-AgentPay-API-Reference/namespaces/AP2/type-aliases/AnyMandate.md)

AP2 mandate to convert (Intent, Cart, or Payment).

### issuerAddress

`string`

PQSafe address of the human issuer (pq1 + 20-byte keccak hex).

### ttlSeconds?

`number`

Override TTL in seconds. If omitted, derived from `mandate.expiresAt`.
  Useful for extending short-lived AP2 mandates to match SpendEnvelope lifetime requirements.

## Returns

An unsigned `SpendEnvelope` ready for `signEnvelope()`.

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

## Throws

If mandate type is unrecognized or required fields are missing.

## Example

```ts
const envelope = ap2MandateToSpendEnvelope(paymentMandate, 'pq1abc...', 3600)
const signed = signEnvelope(envelope, secretKey, publicKey)
```
