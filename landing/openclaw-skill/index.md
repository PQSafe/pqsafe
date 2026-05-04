---
title: "PQSafe OpenClaw Payment Skill — PQ-signed payments for AI agents"
url: https://pqsafe.xyz/openclaw-skill/
type: skill-page
---

# PQSafe OpenClaw Payment Skill (`pqsafe.pay.v1`)

**Post-quantum signed spend envelopes for OpenClaw-compatible AI agents**

Published: Saturday, May 2, 2026

---

## Overview

**SpendEnvelopes** are cryptographically bounded spend authorizations that cap what an agent may spend, on which rail, within a specific time window — signed with ML-DSA-65 (NIST FIPS 204) so that authorizations committed to an audit ledger today remain unforgeable as cryptographic capabilities advance. The `pqsafe.pay.v1` skill brings them to [OpenClaw](https://docs.openclaw.ai) — one of GitHub's top open-source projects with over 367K stars and 50,000+ tools in its ClawHub registry (MIT-licensed) — letting any developer issue, verify, and revoke tamper-evident spend authorizations without changing an agent's existing workflow logic.

---

## Why now

NIST IR 8547 (initial public draft) proposes deprecation of 112-bit classical algorithms — including ECDSA P-256 — by 2030, with full disallowance by 2035. Payment authorization records committed to immutable audit ledgers in 2026 may still be within mandatory retention windows when cryptographically-relevant quantum computers arrive. That is not a theoretical future problem; it is a present design decision.

The retention windows are specific. PSD2 Article 69 mandates payment authorization record retention for 5 years; HKMA Cap. 615 extends that to 7 years for Hong Kong-regulated institutions. Combined with the 2030 deprecation curve, any classically-signed authorization record created today could be within its legally mandated retention window when classical signature security becomes exploitable — creating retrospective signature forgery risk on long-lived financial records.

The regulatory signal has sharpened. HKMA's Quantum Preparedness Index (verified announcement, February 3, 2026) signals that post-quantum readiness has moved from research posture to regulatory expectation. Sumsub's 2025 Fraud Report documents 180% year-over-year growth in AI-assisted multi-step fraud — exactly the attack vector that mandate credentials must defend against.

---

## What the skill exposes

The skill registers three operations under the `pqsafe.pay.v1` namespace:

- **`create_envelope`** — Issue a new SpendEnvelope. Accepts agent ID, payer ID, max amount, currency, rail, and expiry. Returns a signed envelope with a single-use nonce and an ML-DSA-65 signature over the JCS-canonical payload. The signing key never leaves the PQSafe key service.

- **`verify_envelope`** — Verify a SpendEnvelope against the PQSafe public key registry and real-time revocation list. Confirms signature integrity, expiry, nonce uniqueness, and that the stated key ID is current. Returns a structured verification result with a canonical status code.

- **`revoke_envelope`** — Revoke an issued SpendEnvelope before expiry. The envelope ID is appended to the real-time revocation list; subsequent `verify_envelope` calls will return `REVOKED`. Revocation is append-only and timestamped in the audit log.

---

## SpendEnvelope structure

The envelope is a JSON object signed in JCS-canonical form (RFC 8785) before the ML-DSA-65 signature is computed. All fields are included in the signed payload.

```json
{
  "id":         "01HZ9K4PTXQ7V3M8RG0N5JCWEF",
  "agentId":    "agent_acme_expense_bot_v2",
  "payerId":    "payer_usr_0f3a91bc",
  "maxAmount":  "250.00",
  "currency":   "USD",
  "rail":       "airwallex",
  "expiresAt":  "2026-05-02T18:00:00Z",
  "nonce":      "a3f8c21d9b04e67f1c28d5a0b3e9f412c7d6a8e20b51f3c4d97e6a0b2c8d1e4f",
  "signature":  "eyJhbGciOiJNTC1EU0EtNjUiLCJraWQiOiJwcXNhZmUta2V5LTIwMjYtMDEifQ...",
  "keyId":      "pqsafe-key-2026-01"
}
```

- **id** — ULID (monotonically sortable, 26-character base32)
- **maxAmount** — decimal string, never floating-point
- **nonce** — 32-byte hex (256-bit entropy)
- **signature** — base64url-encoded ML-DSA-65 signature (3,309 bytes)
- **keyId** — identifies the public key in the PQSafe registry used to produce this signature

---

## Quick start

Install the npm package and invoke `create_envelope` from any TypeScript agent:

```typescript
import { OpenClawClient } from "@openclaw/sdk";
import "@pqsafe/openclaw"; // registers pqsafe.pay.v1

const claw = new OpenClawClient();

const envelope = await claw.invoke("pqsafe.pay.v1/create_envelope", {
  agentId:   "agent_my_bot_v1",
  payerId:   "payer_usr_abc123",
  maxAmount: "100.00",
  currency:  "USD",
  rail:      "wise",
  expiresAt: "2026-05-02T23:59:59Z",
});
```

---

## Supported rails

| Rail | Status | Currency |
|------|--------|----------|
| `airwallex` | LIVE sandbox | Multi-currency (real test transfers) |
| `wise` | LIVE sandbox | 40+ fiat currencies (real test transfers) |
| `stripe` | mock-ready | USD + 135 others |
| `usdc-base` | mock-ready | USDC |
| `x402` | mock-ready | USDC + ETH |

LIVE sandbox = validated end-to-end with sandbox rails; real test transfers confirmed. Mock-ready = SpendEnvelope creation and verification are fully functional; live rail integration is in progress.

---

## Security model

- **HSM-backed signing keys** — ML-DSA-65 private keys are generated and stored in hardware security modules; they never leave the PQSafe key service
- **Single-use nonce** — each envelope carries a 256-bit random nonce; replay attacks are rejected at the verify layer
- **Expiry enforced in signed payload** — `expiresAt` is part of the signed content; an attacker cannot extend expiry without invalidating the signature
- **Real-time revocation list** — `revoke_envelope` appends to a low-latency revocation list checked on every `verify_envelope` call
- **Append-only audit log** — all create, verify, and revoke events are timestamped and written to an immutable audit log
- **JCS-canonical signing** — the payload is serialized in JSON Canonicalization Scheme form (RFC 8785) before signing, eliminating signature ambiguity from key ordering or whitespace variation

---

## ML-DSA-65 parameters

| Parameter | Value |
|-----------|-------|
| Standard | NIST FIPS 204 |
| Security level | NIST Level 3 |
| Public key size | 1,952 bytes |
| Secret key size | 4,032 bytes |
| Signature size | 3,309 bytes |
| Hardness assumption | Module-LWE + Module-SIS |

---

## Get the skill

- **skill.json descriptor** — [github.com/PQSafe/pqsafe/blob/main/plugins/openclaw-pqsafe/skill.json](https://github.com/PQSafe/pqsafe/blob/main/plugins/openclaw-pqsafe/skill.json)
- **npm package** — `npm install @pqsafe/openclaw` — [npmjs.com/package/@pqsafe/openclaw](https://www.npmjs.com/package/@pqsafe/openclaw)
- **Source (Apache-2.0)** — [github.com/PQSafe/pqsafe/tree/main/plugins/openclaw-pqsafe](https://github.com/PQSafe/pqsafe/tree/main/plugins/openclaw-pqsafe)

---

## References

- NIST FIPS 204 — Module-Lattice-Based Digital Signature Standard (ML-DSA): [csrc.nist.gov/pubs/fips/204/final](https://csrc.nist.gov/pubs/fips/204/final)
- NIST IR 8547 (initial public draft) — Transition to Post-Quantum Cryptography Standards: [csrc.nist.gov/pubs/ir/8547/ipd](https://csrc.nist.gov/pubs/ir/8547/ipd)
- PSD2 Article 69 — Directive (EU) 2015/2366, payment authorization record retention obligation
- HKMA Cap. 615 — Payment Systems and Stored Value Facilities Ordinance, record retention requirements
- HKMA Quantum Preparedness Index — verified announcement, February 3, 2026: [hkma.gov.hk](https://www.hkma.gov.hk)
- Sumsub Identity Fraud Report 2025 — 180% year-over-year growth in AI-assisted multi-step fraud
- IETF RFC 8785 — JSON Canonicalization Scheme (JCS): [datatracker.ietf.org/doc/html/rfc8785](https://datatracker.ietf.org/doc/html/rfc8785)
- OpenClaw — open-source AI agent framework, MIT-licensed: [docs.openclaw.ai](https://docs.openclaw.ai)
- [AP2-PQ Profile RFC](https://pqsafe.xyz/ap2-pq-rfc) — JOSE header parameter specification for post-quantum mandate signatures
- [FIDO Alliance open letter](https://pqsafe.xyz/fido-pq-letter) — post-quantum considerations for AP2 + Verifiable Intent

---

© 2026 PQSafe AgentPay — Licensed under [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) — Contact: [raymond@pqsafe.xyz](mailto:raymond@pqsafe.xyz)
