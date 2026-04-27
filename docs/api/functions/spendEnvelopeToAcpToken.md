[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / spendEnvelopeToAcpToken

# Function: spendEnvelopeToAcpToken()

> **spendEnvelopeToAcpToken**(`env`, `paymentMethodId`): [`CreateSharedPaymentTokenParams`](../PQSafe-AgentPay-API-Reference/namespaces/Stripe/interfaces/CreateSharedPaymentTokenParams.md)

Defined in: [agent-pay/src/adapters/acp.ts:372](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/adapters/acp.ts#L372)

Convert a PQSafe SpendEnvelope back into Stripe SPT creation parameters.

Enables a workflow where an agent holds a SpendEnvelope (issued by a
PQSafe wallet) and needs to obtain a Stripe SPT to actually charge a
customer. The adapter translates envelope policy into SPT usage limits
so the resulting SPT mirrors the human-approved spend bounds.

Field mapping:
  - `env.maxAmount` → `usageLimits.maxAmountPerTransaction` (in smallest currency unit)
  - `env.currency` → `currency`
  - `env.agent` → `agentId`
  - `env.allowedRecipients` → `usageLimits.allowedMerchants`
  - `env.validUntil` (Unix seconds) → `usageLimits.expiresAt` (ISO 8601)

The caller must supply `paymentMethodId` because SpendEnvelopes do not
store Stripe-specific payment method IDs (they are rail-agnostic).

SPT is a single-merchant credential: `env.allowedRecipients` must contain
exactly one merchant ID.

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

### paymentMethodId

`string`

Stripe payment method ID (pm_*) to attach to the SPT.

## Returns

[`CreateSharedPaymentTokenParams`](../PQSafe-AgentPay-API-Reference/namespaces/Stripe/interfaces/CreateSharedPaymentTokenParams.md)

`Stripe.CreateSharedPaymentTokenParams` ready to post to Stripe API.

## Throws

If `env.allowedRecipients.length !== 1` (SPT is single-merchant).

## Throws

If `env.rail` is set and is not `'stripe'` (wrong rail for SPT creation).

## Example

```ts
const params = spendEnvelopeToAcpToken(verifiedEnvelope, 'pm_1PXqBB...')
const spt = await stripe.sharedPaymentTokens.create(params)
```
