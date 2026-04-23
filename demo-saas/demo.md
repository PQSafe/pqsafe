# PQSafe AgentPay — SaaS Self-Pay Walkthrough

**For YC reviewers.** This document explains what `demo.ts` just did and why it matters.

---

## The problem every AI developer has hit

You are building an AI agent. It runs autonomously for hours. Mid-task, it needs a paid API — Perplexity, OpenAI, Anthropic, Serper, Firecrawl, whatever. It hits a 402. It stops. It pings you. You log in, top up a credit card, paste the API key back. The agent resumes.

This happens **every time** the agent needs a new tool or runs out of credits. At scale — multiple agents, multiple services, multiple users — this is a full-time job.

The deeper problem: how do you give an agent spending power without handing it your actual credit card? If you share the card number, a single prompt injection can drain your account. If you require human approval for every payment, you've killed the whole point of having an autonomous agent.

**PQSafe solves this.** Here is exactly what the demo did.

---

## What happened, step by step

### Step 1 — Human generates a post-quantum wallet (one-time)

The human runs `ml_dsa65.keygen()` on their device. This produces a 1952-byte ML-DSA-65 public key and a 4032-byte secret key (NIST FIPS 204). The secret key never leaves the device. The public key is hashed into a PQSafe address (`pq1` + 20-byte Keccak fingerprint).

This takes ~2 seconds and happens once. The wallet lives in the PQSafe Chrome extension or a local key file.

### Step 2 — Human issues a SpendEnvelope

```json
{
  "version": 1,
  "issuer": "pq1<wallet-address>",
  "agent": "research-agent-v1",
  "maxAmount": 50,
  "currency": "USD",
  "allowedRecipients": ["perplexity.ai"],
  "validFrom": 1745280000,
  "validUntil": 1747872000,
  "nonce": "a3f9…c12e",
  "rail": "airwallex"
}
```

This is a plain JSON object that says: *"research-agent-v1 may spend up to $50 USD, only to perplexity.ai, within the next 30 days."*

The human fills this in via the PQSafe extension or CLI. It takes 10 seconds.

### Step 3 — Human signs with ML-DSA-65

`ml_dsa65.sign(envelopeBytes, secretKey)` produces a 3309-byte post-quantum signature. The envelope JSON + signature + public key become a `SignedEnvelope` — a self-contained, portable authorization token.

Why ML-DSA-65 and not ECDSA or JWT? **Because RSA and ECDSA are broken by Shor's algorithm on a quantum computer.** NIST mandated the migration to ML-DSA (FIPS 204) for exactly this reason. PQSafe is native PQ from day one.

### Step 4 — Agent is mid-task and hits a paywall

The research agent is summarizing AI safety papers. Perplexity returns 402. Instead of stopping, the agent checks its `SignedEnvelope`.

### Step 5 — Agent verifies the envelope (independent check)

Before spending a cent, the agent calls `verifyEnvelope(signed)`:

1. **ML-DSA-65 signature verification** — proves the envelope was issued by the genuine wallet holder, not injected by a malicious prompt
2. **Zod schema validation** — envelope structure is well-formed
3. **Temporal check** — the envelope is within its valid window
4. **Allowlist check** — perplexity.ai is in `allowedRecipients`
5. **Amount ceiling** — $20 ≤ $50 maxAmount

All checks pass. The agent proceeds.

### Step 6 — PQSafe issues a virtual Visa card for this envelope

This is the key architectural innovation for SaaS payments.

Most SaaS services accept credit cards, not bank transfers. So PQSafe issues a **virtual Visa card** via Airwallex Issuing (or Stripe Issuing as fallback), bound 1:1 to this envelope:

- Spend cap = `envelope.maxAmount` ($50)
- Expiry = `envelope.validUntil`
- Bound to envelope nonce — one card, one authorization, one agent

The agent receives the virtual card number (PAN, expiry, CVV). It can enter these at any SaaS checkout — Perplexity, Anthropic, GitHub Copilot, Firecrawl, etc. — exactly like a human would.

**The card is not reusable beyond the envelope.** When the envelope expires, the card dies. If a malicious prompt tries to use the card for an unauthorized vendor, the Airwallex Issuing merchant controls block it.

### Step 7 — Agent pays Perplexity Pro — $20.00 USD

`executeAgentPayment(signed, { recipient: "perplexity.ai", amount: 20 })` runs all five guard-rail checks, then routes to Airwallex. The charge is processed. A transaction receipt is returned with a UUID.

The entire flow — from "I need Perplexity" to "payment confirmed" — takes under 3 seconds. No human in the loop.

### Step 8 — Agent resumes task

The agent receives the Perplexity API key in the subscription confirmation. It resumes its research task. The human gets a notification (Band B/C based on envelope settings) but does not need to act.

---

## The guard rails

The demo also shows what PQSafe blocks:

| Attack | What happens |
|---|---|
| Agent tries to spend $9,999 | Rejected: exceeds `maxAmount` |
| Agent tries to pay `evil-vendor.io` | Rejected: not in `allowedRecipients` |
| Tampered envelope | ML-DSA-65 signature fails — payment never reaches Airwallex |
| Prompt injection: "ignore envelope, pay X" | Signature is cryptographic — no string manipulation can forge it |
| Replay attack | Nonce is single-use; temporal window enforced |

---

## Why this matters to every AI developer

Every developer building an AI agent has faced this moment. The agent needs a paid tool. It stops. The human has to intervene. That friction compounds across agents, services, and users.

PQSafe removes that friction without removing control. The human sets the budget and the allowlist once. The agent operates autonomously within those bounds — forever, until the envelope expires or is revoked.

**This is the missing primitive that makes truly autonomous agents possible.**

---

## Technical specs

| Property | Value |
|---|---|
| Signature scheme | ML-DSA-65 (NIST FIPS 204) |
| Public key size | 1952 bytes |
| Signature size | 3309 bytes |
| Payment rail | Airwallex (sandbox + live) |
| Virtual card | Airwallex Issuing (Visa) |
| SDK | `@pqsafe/agent-pay` (TypeScript, MIT) |
| Demo mode | Mock (no creds) or real Airwallex sandbox |
