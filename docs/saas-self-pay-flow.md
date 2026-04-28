# PQSafe AgentPay — SaaS Self-Pay Flow

**Status:** Design complete. Demo implemented in `demo-saas/demo.ts`.

---

## Overview

This document defines the technical flow for an AI agent autonomously purchasing a SaaS subscription using PQSafe AgentPay. This is the hero product use case: agents that pay for their own tools.

---

## The Problem

SaaS services accept credit cards. AI agents do not have credit cards. The current workaround — sharing a credit card number with an agent — is:

- **Insecure:** prompt injection can redirect spend to any vendor
- **Unauditable:** no per-agent, per-purpose spend tracking
- **Brittle:** requires human intervention every time a new tool is needed
- **Not post-quantum safe:** classical auth (JWT/ECDSA) will be broken by Shor's algorithm

---

## Solution Architecture

PQSafe issues a **virtual card per SpendEnvelope**. The card is:

- Bound 1:1 to a PQ-signed envelope (issuer, agent, maxAmount, allowedRecipients, validUntil)
- Spend-capped at `envelope.maxAmount` at the Airwallex Issuing network level
- Auto-expires when `envelope.validUntil` is reached
- Usable at any SaaS checkout — Perplexity, Anthropic, GitHub Copilot, Firecrawl, etc.

---

## Complete Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HUMAN (one-time setup, ~30 seconds)                                        │
│                                                                             │
│  1. Generate ML-DSA-65 keypair (NIST FIPS 204)                              │
│     → sk (4032 bytes, stays on device)                                      │
│     → pk (1952 bytes)                                                       │
│     → PQSafe address = pq1 + keccak(pk)[0:20]                              │
│                                                                             │
│  2. Create SpendEnvelope {                                                  │
│       issuer: "pq1<address>",                                               │
│       agent: "research-agent-v1",                                           │
│       maxAmount: 50,                                                        │
│       currency: "USD",                                                      │
│       allowedRecipients: ["perplexity.ai"],                                 │
│       validFrom: now,                                                       │
│       validUntil: now + 30d,                                                │
│       nonce: random-128-bit,                                                │
│       rail: "airwallex"                                                     │
│     }                                                                       │
│                                                                             │
│  3. Sign: signature = ml_dsa65.sign(envelopeBytes, sk)                      │
│     → SignedEnvelope = { envelopeJson, signature, dsaPublicKey }            │
│     → Pass SignedEnvelope to agent (JSON, ~10KB)                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ SignedEnvelope (portable, tamper-proof)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  AGENT (autonomous runtime)                                                 │
│                                                                             │
│  4. Agent is running task. Perplexity API returns 402 Payment Required.    │
│     Perplexity Pro = $20/month.                                             │
│                                                                             │
│  5. Agent calls verifyEnvelope(signed):                                     │
│     ├── ML-DSA-65 signature check           → PASS                         │
│     ├── Zod schema validation               → PASS                         │
│     ├── Temporal window (now in range)      → PASS                         │
│     ├── "perplexity.ai" in allowedRecipients→ PASS                         │
│     └── $20 ≤ maxAmount ($50)               → PASS                         │
│                                                                             │
│  6. Agent calls pqsafe.issueVirtualCard(signedEnvelope):                   │
│     → POST /issuing/cards (Airwallex API)                                   │
│     → Returns: { pan: "4532 xxxx xxxx 7291", expiry, cvv, spendCap: $50 }  │
│                                                                             │
│  7. Agent navigates to perplexity.ai/pro checkout (Playwright/browser tool)│
│     → Enters virtual card PAN, expiry, CVV                                 │
│     → Perplexity charges $20 to the virtual card                            │
│     → Airwallex approves charge (within spend cap, merchant = perplexity)  │
│                                                                             │
│  8. OR (API model — preferred where available):                             │
│     executeAgentPayment(signed, { recipient: "perplexity.ai", amount: 20 })│
│     → verifyEnvelope → allowlist → ceiling → Airwallex transfers/create    │
│     → Returns: { txId, amount, executedAt, … }                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ txId + API key
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  POST-PAYMENT                                                               │
│                                                                             │
│  9.  Ledger records transaction:                                            │
│      { agent, issuer, vendor, amount, txId, envelopeNonce, timestamp }     │
│                                                                             │
│  10. Human notification (Band B/C):                                         │
│      "research-agent-v1 purchased Perplexity Pro — $20. Budget: $30 left." │
│      (no action required unless budget alert threshold reached)             │
│                                                                             │
│  11. Agent receives Perplexity API key. Resumes task.                       │
│      Log: "Perplexity Pro activated. Remaining budget: $30/month."         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## SpendEnvelope Schema (relevant fields)

```typescript
{
  version:           1,                           // schema version
  issuer:            "pq1<40-hex>",               // human PQ address (ML-DSA-65 pubkey hash)
  agent:             "research-agent-v1",          // which agent is authorized
  maxAmount:         50,                           // USD cap (hard limit)
  currency:          "USD",
  allowedRecipients: ["perplexity.ai"],            // allowlist — empty = frozen
  validFrom:         1745280000,                  // unix timestamp
  validUntil:        1747872000,                  // unix timestamp (30 days)
  nonce:             "a3f9c12e...",               // 128-bit replay prevention
  rail:              "airwallex"                  // payment rail constraint
}
```

---

## Virtual Card Binding Model

One envelope → one virtual card. This is the key security property.

| Property | Value |
|---|---|
| Card issuer | Airwallex Issuing (Visa) or Stripe Issuing (fallback) |
| Spend cap | `envelope.maxAmount` — hard-enforced by card network |
| Expiry | Derived from `envelope.validUntil` |
| Merchant controls | Locked to `allowedRecipients` (Airwallex MCC/merchant controls) |
| Revocation | Revoke envelope → card disabled in real-time |
| Nonce binding | Card metadata stores `envelope.nonce` — one-to-one traceability |

---

## Notification Bands

| Band | Trigger | Human action needed |
|---|---|---|
| A (alert) | Payment fails OR spend >90% of cap | Yes — review |
| B (inform) | Successful payment >$10 | No — FYI only |
| C (silent) | Successful payment ≤$10 | No — log only |

Band is configurable per envelope. Default: B for all SaaS purchases.

---

## Guard Rails (enforced before any Airwallex call)

```
verifyEnvelope() checks (in order):
  1. ML-DSA-65 signature valid                   → else: SIGNATURE_INVALID
  2. JSON schema valid (Zod)                      → else: SCHEMA_INVALID
  3. now ≥ validFrom AND now ≤ validUntil         → else: TEMPORAL_INVALID
  4. recipient ∈ allowedRecipients                → else: RECIPIENT_NOT_ALLOWED
  5. amount > 0 AND amount ≤ maxAmount            → else: AMOUNT_EXCEEDS_CAP
```

No payment is attempted if any check fails. Error is surfaced to the agent — it does not retry, it reports to the human.

---

## Threat Model

| Threat | Mitigation |
|---|---|
| Prompt injection: "pay evil.io instead" | `allowedRecipients` is in the ML-DSA-65 signed payload. String manipulation cannot change it. |
| Stolen envelope JSON | Without the issuer's ML-DSA secret key, a tampered envelope fails signature check. |
| Overspend | `maxAmount` is in the signed payload AND enforced at the Airwallex card network level. Dual enforcement. |
| Replay attack | `nonce` is 128-bit random. Ledger deduplicates on nonce. |
| Quantum adversary | ML-DSA-65 is NIST FIPS 204 — secure against Shor's algorithm. |
| Expired envelope | `validUntil` is checked by `verifyEnvelope()` AND the virtual card expires at the same time. |

---

## Implementation Status

| Component | Status |
|---|---|
| `createEnvelope` / `signEnvelope` / `verifyEnvelope` | Complete — `agent-pay/src/envelope.ts` |
| `executeAgentPayment` + guard rails | Complete — `agent-pay/src/index.ts` |
| Airwallex wire transfer rail | Complete — `agent-pay/src/rails/airwallex.ts` |
| Virtual card issuance (Airwallex Issuing) | Architecture complete — implementation next sprint |
| Demo script (this scenario) | Complete — `demo-saas/demo.ts` |
| Browser demo update | Complete — `demo/index.html` |
| Stripe Issuing fallback | Designed — `docs/virtual-card-architecture.md` |
