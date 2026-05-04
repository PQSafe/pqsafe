---
title: "Verify a PQSafe SpendEnvelope — agent payment authorization check"
url: https://pqsafe.xyz/verify/
type: tool
---

# Verify a SpendEnvelope

Paste a PQSafe SpendEnvelope JSON below. Verification runs entirely in your browser — nothing is sent to PQSafe servers. ECDSA P-256 + ML-DSA-65 (FIPS 204) dual-signature. RFC 8785 JCS canonicalization.

**Live tool:** [pqsafe.xyz/verify](https://pqsafe.xyz/verify)

---

## How this works

1. **Canonicalize.** Mandate fields (without `signature`) are serialized via RFC 8785 JCS — a deterministic JSON canonical form.
2. **Fingerprint.** SHA-256 of the canonical bytes produces a 32-byte fingerprint.
3. **Dual-sign.** The fingerprint is signed twice: ECDSA P-256 (~71 bytes DER) and ML-DSA-65 (3,309 bytes per FIPS 204) using the issuer's keys.
4. **Verify.** Anyone with the public keys can verify both signatures against the recomputed fingerprint. Tampering any field invalidates both.

**Spec:** [NIST FIPS 204](https://csrc.nist.gov/pubs/fips/204/final) · [RFC 8785 JCS](https://datatracker.ietf.org/doc/rfc8785/) · [AP2 Post-Quantum Profile RFC](https://pqsafe.xyz/ap2-pq-rfc) · [Open letter to FIDO Payments TWG](https://pqsafe.xyz/fido-pq-letter)

---

## Example test vectors

The verifier ships with 5 deterministic test cases (TC1–TC5):

| Case | Name | What it validates | Expected result |
|------|------|-------------------|----------------|
| TC1 | Minimal mandate | Baseline: minimum required fields, single payee | ECDSA ✓, ML-DSA-65 ✓ |
| TC2 | Array order | JCS preserves insertion order; reverse-alphabetical payee array MUST NOT be sorted | ECDSA ✓, ML-DSA-65 ✓ |
| TC3 | Decimal normalization | RFC 8785 §3.2.2: `1.10 → 1.1`, `100.0 → 100` | ECDSA ✓, ML-DSA-65 ✓ |
| TC4 | 7-year retention mandate | Retention metadata included in signed bytes; HKMA-Cap615-7yr policy | ECDSA ✓, ML-DSA-65 ✓ |
| TC5 | Tampered (TC1 +1¢) | TC1 amount changed `"125.00" → "125.01"` — MUST fail both verifiers | ECDSA ✗, ML-DSA-65 ✗ |

---

## Failure modes

Cryptographic verification rejects tampered envelopes:

- **Tampered amount** — Change any numeric field by even 1 cent; both signatures fail immediately.
- **TC5 tamper case** — TC1 envelope with 1-cent amount inflation; demonstrates that any classically-signed envelope with incorrect ML-DSA-65 coverage fails both verification paths.

---

## For SaaS receivers

The same verification runs server-side via the PQSafe Verifier API. Integrate once; reject agent payments that arrive without a valid SpendEnvelope.

```bash
curl -X POST https://api.pqsafe.xyz/v1/verify \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"envelope_jws": "...", "expected_amount": 50.00, "expected_currency": "HKD"}'
```

[Verifier API docs](https://github.com/PQSafe/pqsafe/tree/main/verifier-api)

---

## What a verified envelope looks like

A successful verification returns:

- **Signatures:** ECDSA P-256 ✓ (bytes DER) and ML-DSA-65 ✓ (3,309 bytes)
- **JCS canonical bytes:** the exact byte count of the canonical payload
- **Fingerprint:** SHA-256 hex of the canonical bytes
- **Mandate fields:** parsed issuer, agent, maxAmount, currency, allowedRecipients, validFrom, validUntil, nonce, rail

A failed verification returns the specific reasons: invalid signature, expired envelope, schema error, or tampered field.

---

**Notes:**
- Verification runs client-side; no envelope data is sent to PQSafe servers.
- Apache-2.0 · [Source: github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe)
- Contact: [raymond@pqsafe.xyz](mailto:raymond@pqsafe.xyz)

---

**See also:**
- [Read the AP2-PQ Profile RFC](https://pqsafe.xyz/ap2-pq-rfc)
- [Read the FIDO open letter](https://pqsafe.xyz/fido-pq-letter)
- [GitHub: PQSafe/ap2-pq-test-vectors](https://github.com/PQSafe/ap2-pq-test-vectors)
