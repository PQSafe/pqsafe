[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / acpTokenToSpendEnvelope

# Function: acpTokenToSpendEnvelope()

> **acpTokenToSpendEnvelope**(`token`, `issuerAddress`, `agentId?`): `object`

Defined in: [agent-pay/src/adapters/acp.ts:272](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L272)

Convert a Stripe Shared Payment Token to a PQSafe SpendEnvelope.

The adapter maps SPT authorization limits to SpendEnvelope policy fields:
  - `token.usageLimits.maxAmountPerTransaction` → `SpendEnvelope.maxAmount`
    (falls back to `maxTotalAmount` if per-transaction limit is absent)
  - `token.currency` → `SpendEnvelope.currency`
  - `token.agentId` → `SpendEnvelope.agent`
  - `token.usageLimits.allowedMerchants[0]` → `SpendEnvelope.allowedRecipients`
  - `token.usageLimits.expiresAt` (ISO 8601) → `SpendEnvelope.validUntil`

Currency unit conversion: Stripe stores all amounts in the smallest currency
unit (e.g. cents for USD/EUR/GBP/CAD/AUD). This adapter divides by 100 to
produce a major-unit amount in the SpendEnvelope.

EXCEPTION: Zero-decimal currencies (JPY, KRW, BIF, CLP, GNF, MGA, PYG,
RWF, UGX, VND, VUV, XAF, XOF, XPF) are NOT divided — Stripe stores them
already in major units. See ZERO_DECIMAL_CURRENCIES list in this module.

## Parameters

### token

[`SharedPaymentToken`](../PQSafe-AgentPay-API-Reference/namespaces/Stripe/interfaces/SharedPaymentToken.md)

A `Stripe.SharedPaymentToken` retrieved from the Stripe API.

### issuerAddress

`string`

PQSafe address of the human issuer (pq1 + 20-byte keccak hex).
  Must match the Stripe customer who created the SPT.

### agentId?

`string`

Override for the agent identifier. If omitted, uses `token.agentId`.
  Useful when an SPT is reused across multiple named agent sessions.

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

If `token.active` is false (cannot create envelope for inactive token).

## Throws

If `usageLimits.allowedMerchants` is absent or empty (required by PQSafe policy).

## Example

```ts
const envelope = acpTokenToSpendEnvelope(spt, 'pq1abc...', 'my-agent-v1')
const signed = signEnvelope(envelope, secretKey, publicKey)
```
