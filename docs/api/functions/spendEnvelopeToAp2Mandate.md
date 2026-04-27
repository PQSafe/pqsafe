[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / spendEnvelopeToAp2Mandate

# Function: spendEnvelopeToAp2Mandate()

> **spendEnvelopeToAp2Mandate**(`env`, `mandateType`): [`AnyMandate`](../PQSafe-AgentPay-API-Reference/namespaces/AP2/type-aliases/AnyMandate.md)

Defined in: [agent-pay/src/adapters/ap2.ts:441](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/ap2.ts#L441)

Convert a PQSafe SpendEnvelope back into an AP2 mandate.

Useful for agents that receive a SpendEnvelope from a wallet and need to
present a mandate to an AP2-aware merchant without stripping the PQ guarantees.
The returned mandate retains a `metadata.pqEnvelopeHash` field containing
the keccak-256 digest of the envelope bytes for auditability.

## Parameters

### env

A validated `SpendEnvelope` (from `verifyEnvelope()`).

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

### mandateType

`"intent"` \| `"cart"` \| `"payment"`

Which AP2 mandate type to produce:
  - `'intent'` — builds an `IntentMandate` using `maxAmount` as the intent ceiling.
  - `'cart'` — builds a `CartMandate` with a single synthetic line item.
  - `'payment'` — builds a `PaymentMandate` using `allowedRecipients[0]` as
    the recipient address. Throws if `allowedRecipients` is empty.

## Returns

[`AnyMandate`](../PQSafe-AgentPay-API-Reference/namespaces/AP2/type-aliases/AnyMandate.md)

The AP2 mandate object matching the requested type.

## Throws

If `mandateType` is `'payment'` and `env.allowedRecipients` is empty.

## Example

```ts
const mandate = spendEnvelopeToAp2Mandate(verifiedEnvelope, 'payment')
// mandate.type === 'payment'
```
