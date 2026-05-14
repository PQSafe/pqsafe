---
title: "AP2 Post-Quantum Profile RFC — PQSafe contribution to FIDO Payments TWG"
url: https://pqsafe.xyz/ap2-pq-rfc/
type: rfc
---

# Post-Quantum Signature Profile for AP2-style Agent-Payment Mandates

**Document ID:** AP2-PQ-EXT-01 · Standards Track (Community Draft) · DRAFT

**Status:** Community Draft · v9 (2026-05-01) · Apache-2.0

**Contact:** [raymond@pqsafe.xyz](mailto:raymond@pqsafe.xyz) · Feedback deadline: 2026-05-15

---

## Abstract

This document specifies a post-quantum signing profile for AP2-style SD-JWT mandate credentials, proposed to the FIDO Alliance Payments Technical Working Group via open letter (May 2026). The profile adds two JOSE header parameters — `pq_alg` and `pq_sig` — to the existing JWT header used in AP2 v0.2 mandate credentials. The primary algorithm identifier is `"ML-DSA-65"`, corresponding to NIST FIPS 204 (initial public draft qualifier: NIST IR 8547 ipd). A hybrid profile `"ES256+ML-DSA-65"` is defined for deployments requiring both classical interoperability and quantum resistance in a single signing operation. The extension is strictly backward-compatible: classical verifiers that do not recognize `pq_alg` continue to verify the `alg: "ES256"` signature and ignore the additional header parameters.

| Field | Value |
|-------|-------|
| Authors | The founders of PQSafe AgentPay |
| Contact | [raymond@pqsafe.xyz](mailto:raymond@pqsafe.xyz) |
| Created | 2026-04-28 |
| Last revised | 2026-05-01 (Revision 02) |
| Feedback | [rfc@pqsafe.xyz](mailto:rfc@pqsafe.xyz) · [GitHub Issues](https://github.com/PQSafe/pqsafe/issues) · Deadline: 2026-05-15 |
| License | Apache-2.0 |

**Related:** [Open Letter to FIDO TWG](https://pqsafe.xyz/fido-pq-letter) · [Live Verifier](https://pqsafe.xyz/verify) · [Test Vectors Repository](https://github.com/PQSafe/ap2-pq-test-vectors) · [Reference Implementation](https://github.com/PQSafe/pqsafe)

---

## §1 Background — Why Post-Quantum, Why Now

### 1.1 The Harvest-Now-Forge-Later Threat

"Harvest Now, Decrypt Later" (HNDL) is well understood: nation-state adversaries collect ciphertext today for decryption once a cryptographically-relevant quantum computer (CRQC) arrives. AP2-style mandate credentials face the less-discussed but structurally identical sibling threat: **Harvest Now, Forge Later (HNFL)**.

In HNFL, an adversary collects classically-signed payment authorization records — SD-JWT mandate credentials logged to immutable audit trails — and retrospectively forges them once a CRQC enables reconstruction of ECDSA private keys from their corresponding public keys via Shor's algorithm. For a 15-minute web session token, this risk is negligible. For a payment authorization mandate retained in a financial audit log for seven years, the risk is material: the mandatory retention window overlaps the projected CRQC arrival window for several credible threat timelines.

AP2 mandate credentials have three properties that make them a higher-priority PQ migration target than standard OAuth access tokens or short-lived JWTs:

1. **Long retention windows.** Financial authorization records must be retained for 5–7 years under HKMA Anti-Money Laundering rules (Cap. 615), IRD requirements (Cap. 112), and PSD2 Article 69 (5 years for payment service providers in EU jurisdictions). A mandate signed today under `ES256` will still be within its mandatory retention window in 2032–2033.

2. **Public key discoverability.** AP2 mandate signing keys published in DID documents or `/.well-known` authorization server metadata can be harvested at scale without intercepting individual mandates. An adversary with a CRQC can reconstruct the private key from the public key and forge any historically-collected mandate.

3. **Dispute resolution utility.** The cryptographic integrity of a mandate credential is an evidentiary property in regulatory audits, insurance disputes, and litigation. Forged mandates presented as authoritative audit evidence have direct legal and financial consequences that extend beyond individual transaction amounts.

### 1.2 Regulatory Drivers

**NIST IR 8547 (2024, initial public draft).** The U.S. National Institute of Standards and Technology proposes deprecation of 112-bit classical algorithms (including P-256 ECDSA, which underlies `ES256`) by 2030, and full disallowance by 2035 for high-priority systems including payment-critical infrastructure. NIST IR 8547 explicitly references FIPS 204 (ML-DSA) as the standardized transition target for signature schemes. *Status: initial public draft — not yet final NIST policy.*

**HKMA Quantum Preparedness Index (QPI), announced February 3, 2026.** The Hong Kong Monetary Authority has launched a formal quantum readiness assessment framework for regulated entities operating in Hong Kong. The QPI references NIST PQC standards and requires regulated institutions to begin quantum readiness assessments covering payment-critical systems. Retention obligations under Cap. 615 are 6 years; under IRD Cap. 112 they extend to 7 years.

**PSD2 Article 69.** Payment service providers subject to the revised Payment Services Directive in EU jurisdictions are required to retain payment authorization records for a minimum of 5 years. A mandate issued in 2026 remains within its mandatory PSD2 retention window until 2031 — a date that falls within the most aggressive CRQC arrival estimates.

### 1.3 Algorithm Selection Rationale — Why ML-DSA-65, Not Falcon or SLH-DSA

Three NIST-standardized post-quantum signature algorithms were evaluated:

**Falcon-512** produces ~666-byte signatures — substantially smaller than ML-DSA-65's 3,309 bytes. However, Falcon's signing algorithm requires constant-time floating-point arithmetic (discrete Gaussian sampling over lattices using floating-point rejection sampling). Software implementations carry significant timing side-channel risk that is inappropriate for payment signing infrastructure on general-purpose CPUs. Falcon is excluded on safety-of-implementation grounds.

**SLH-DSA** (NIST FIPS 205) rests on conservative hash-function security assumptions. However, SLH-DSA-128s produces 7,856-byte signatures; larger parameter sets reach 49,856 bytes. These sizes exceed practical limits for per-transaction mandate payloads. SLH-DSA is excluded on wire-size grounds.

**ML-DSA-65** (NIST FIPS 204, λ=192 parameter set) provides NIST Category 3 security (at least 128-bit classical-equivalent) with 3,309-byte signatures, constant-time software implementations in production-grade libraries, and no floating-point arithmetic requirement. ML-DSA-65 at 3,309 bytes is the appropriate tradeoff for regulated financial deployments with mandatory retention requirements. The OID is `2.16.840.1.101.3.4.3.18`.

### 1.4 Structural Alignment with AP2 v0.2 SD-JWT Architecture

AP2 v0.2 uses SD-JWT mandate credentials with `"alg": "ES256"` in the JWT header. This profile follows the same structural convention: the signing algorithm is declared in the JWT header, not the mandate payload body. This extension adds `pq_alg` and `pq_sig` as additional JWT header parameters — additive, not replacing the classical `alg` and its corresponding signature. The SD-JWT payload and `_sd` claim structure are unchanged.

---

## §2 Specification — JOSE Header Parameter Extension

### 2.1 Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHOULD", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 ([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119), [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)).

| Term | Definition |
|------|-----------|
| `ML-DSA-65` | Module-Lattice-Based Digital Signature Algorithm, NIST Category 3 parameter set, as specified in NIST FIPS 204 (August 2024, initial public draft qualifier: NIST IR 8547 ipd). Formerly known as Dilithium3. |
| `pq_alg` | JOSE header parameter identifying the post-quantum (or hybrid) algorithm used to produce `pq_sig`. |
| `pq_sig` | JOSE header parameter containing the post-quantum signature, Base64url-encoded. |
| JCS | JSON Canonicalization Scheme. RFC 8785. Deterministic UTF-8 serialization with keys sorted lexicographically at all nesting levels; array element order preserved. |
| JWS Signing Input | Per RFC 7515 §7.2.1: the ASCII bytes of `BASE64URL(JWS Protected Header) || '.' || BASE64URL(JWS Payload)`. |
| CRQC | Cryptographically Relevant Quantum Computer. A quantum computer with sufficient fault-tolerant qubit count to run Shor's algorithm against P-256 or equivalent elliptic-curve groups. |
| HNFL | Harvest Now, Forge Later. Adversarial strategy of collecting classically-signed records today for retrospective forgery once a CRQC is available. |

### 2.2 Proposed JOSE Header Parameters

For AP2 v0.2 SD-JWT mandate credentials, this profile proposes two new JOSE header parameters, registered in accordance with [RFC 7515 §4.1](https://www.rfc-editor.org/rfc/rfc7515):

**`pq_alg`**
- Parameter value type: String
- Allowed values: `"ML-DSA-65"` | `"ES256+ML-DSA-65"`
- Identifies the post-quantum (or hybrid) algorithm used to produce the `pq_sig` value. The classical `alg` parameter MUST remain present and MUST be a valid JOSE algorithm identifier; `pq_alg` is additive, not a replacement. MUST be ignored by verifiers that do not implement this profile.

**`pq_sig`**
- Parameter value type: String (Base64url, RFC 4648 §5, unpadded)
- The post-quantum signature over the JWS Signing Input per RFC 7515 §7.2.1. The signing algorithm is identified by `pq_alg`. Encoded length for `"ML-DSA-65"`: 4,412 characters (3,309 bytes, Base64url-encoded).

### 2.3 Example JWT Header

```json
{
  "alg": "ES256",
  "pq_alg": "ML-DSA-65",
  "pq_sig": "<Base64url-encoded ML-DSA-65 signature, 4412 chars>",
  "_sd_alg": "sha-256"
}
```

Classical verifiers process `alg: "ES256"` and ignore `pq_alg` and `pq_sig`. Post-quantum verifiers process both. No changes to the SD-JWT payload or `_sd` claim structure are required.

### 2.4 HashML-DSA Mode (Normative)

> **Normative requirement:** Implementations MUST use HashML-DSA mode (FIPS 204 §5.4), not pure-mode ML-DSA. The signing input is the SHA-256 digest of the JWS Signing Input bytes. Verifiers MUST reject `pq_sig` values generated under pure-mode when `pq_alg: "ML-DSA-65"` is declared.

```
signing_input = ASCII(BASE64URL(header)) || 0x2E || ASCII(BASE64URL(payload))
fingerprint   = SHA-256(signing_input)          # 32 bytes
pq_sig_bytes  = ML-DSA-65.Sign(sk, fingerprint) # 3309 bytes
pq_sig        = BASE64URL(pq_sig_bytes)          # 4412 chars, unpadded
```

Implementations using pure-mode ML-DSA-65 (signing the full JWS Signing Input without pre-hashing) will produce non-interoperable signatures. This distinction MUST be explicit in any conforming implementation.

RFC 8785 (JCS) canonicalization applies to the mandate payload prior to SD-JWT encoding. The same canonical byte sequence feeds both the ECDSA and ML-DSA-65 signing operations where a pre-JWT canonicalization step is present.

### 2.5 Hybrid Profile: `"ES256+ML-DSA-65"`

When `pq_alg: "ES256+ML-DSA-65"` is declared:

- The `pq_sig` value encodes two concatenated signatures: `ECDSA_P256_sig (64 bytes, R||S fixed-width) || ML-DSA-65_sig (3309 bytes)` = 3,373 bytes total, Base64url-encoded.
- Verifiers implementing the hybrid profile MUST verify both component signatures. Failure of either MUST result in verification failure.
- This profile is intended for deployments that require a dual-algorithm audit trail during the transition period while ML-DSA-65 implementations mature.

### 2.6 OID Alignment

| Algorithm | OID | Standard |
|-----------|-----|----------|
| ML-DSA-65 | `2.16.840.1.101.3.4.3.18` | NIST FIPS 204 (initial public draft qualifier) |
| ECDSA P-256 (ES256) | `1.2.840.10045.3.1.7` | RFC 5480, RFC 7518 §3.4 |

Implementers MUST verify the ML-DSA-65 OID against the [NIST CSOR registry](https://csrc.nist.gov/projects/computer-security-objects-register/algorithm-registration) before deployment; OID assignments may be revised during the early standardization period.

### 2.7 Byte-Level Encoding

| Component | Raw bytes | Base64url chars (unpadded) |
|-----------|-----------|---------------------------|
| ML-DSA-65 signature | 3,309 | 4,412 |
| ML-DSA-65 public key | 1,952 | ~2,603 |
| ECDSA P-256 signature, R\|\|S (hybrid) | 64 | 86 |
| Hybrid pq_sig total | 3,373 | ~4,498 |

All encoding uses Base64url (RFC 4648 §5, unpadded). Implementations MUST NOT accept signatures that decode to any length other than 3,309 bytes (ML-DSA-65 mode) or 3,373 bytes (hybrid mode).

---

## §3 Wire Format — Before and After

### 3.1 Baseline AP2 Mandate (No PQ Extension)

```json
// JWT header (baseline)
{
  "alg": "ES256",
  "_sd_alg": "sha-256"
}

// Mandate payload (illustrative)
{
  "iss": "https://auth.example.com",
  "sub": "did:web:user.example.com:alice",
  "agent_id": "did:web:agents.example.com:purchasing-bot-v2",
  "payee_constraints": [
    { "payee_id": "did:web:stripe.com:merchant:acct_1A2B3C4D" },
    { "payee_id": "did:web:airwallex.com:merchant:aw_1X2Y3Z" }
  ],
  "spend_cap": 500.00,
  "currency": "USD",
  "valid_from": "2026-05-01T00:00:00Z",
  "valid_until": "2026-05-01T23:59:59Z",
  "nonce": "a3f8c2e1d4b7906f2c5e8a1b4d7f0e3c"
}
```

### 3.2 Same Mandate With PQ Profile Applied

The PQ profile is applied entirely at the JWT header level. The mandate payload is unchanged.

```json
// JWT header with pq_alg + pq_sig added
{
  "alg": "ES256",
  "pq_alg": "ML-DSA-65",
  "pq_sig": "<Base64url-encoded ML-DSA-65 signature, 4412 chars — see §4 for test vectors>",
  "_sd_alg": "sha-256"
}

// Mandate payload — identical to baseline, no changes
```

### 3.3 Signing Input Construction

```
signing_input = BASE64URL(JWS Protected Header) || "." || BASE64URL(JWS Payload)

# HashML-DSA pre-hash (normative per §2.4):
fingerprint = SHA-256(signing_input)    # 32 bytes

# Sign the fingerprint, not the raw signing_input:
pq_sig_bytes = ML-DSA-65.Sign(sk, fingerprint)   # 3309 bytes
pq_sig       = BASE64URL(pq_sig_bytes)            # included in JWT header
```

### 3.4 Retention-Aware Mandate Example (TC4)

```json
// Mandate payload with retention metadata
{
  "agent_id": "did:web:agents.example.com:agent-tc4",
  "amount": "88000.00",
  "currency": "HKD",
  "issued_at": "2026-05-01T00:00:00.000Z",
  "nonce": "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
  "recipient": "did:web:payee.example.com:main",
  "retention_metadata": {
    "policy": "HKMA-Cap615-7yr",
    "retention_until": "2033-05-01T00:00:00.000Z"
  }
}
```

> **JCS number normalization (RFC 8785 §3.2.2):** `500.00` serializes as `500`; `1.10` serializes as `1.1`; `100.0` serializes as `100`. Trailing zeros and unnecessary decimal points are removed. String-typed amount fields (e.g., `"88000.00"`) are serialized verbatim — no normalization applies to string values.

---

## §4 Test Vectors

Five deterministic test cases (TC1–TC5) are published at [github.com/PQSafe/ap2-pq-test-vectors](https://github.com/PQSafe/ap2-pq-test-vectors) (Apache-2.0). The frozen byte-exact fixture is `vectors.json`, committed alongside the generator (`generate_vectors.ts`).

### Key Test Vector Parameters

| Parameter | Value |
|-----------|-------|
| ML-DSA-65 key seed derivation | `SHA-256("pqsafe-ap2-tc-mldsa")` |
| ECDSA key seed derivation | `SHA-256("pqsafe-ap2-tc-ecdsa")` |
| Library versions | `@noble/post-quantum@0.6.0` (exact, no caret), `@noble/curves@1.4.0`, `canonicalize@2.0.0` |
| TC1 SHA-256 fingerprint | `8617d93f851c2a1fb72f49c90a27e874666fd0c98b4992809d55eec6ef1da539` |
| TC2 SHA-256 fingerprint | `f447cb36ee1fe1dbbecbf5961bcb8ae7038a4881a84912bfc89809d998b07e01` |
| Cross-platform CI | Mac, Linux x86-64, Windows (GitHub Actions) |

> **WARNING — ML-DSA.Sign vs. HashML-DSA.Sign:** The generator calls `ml_dsa65.sign(sk, fingerprint)` — Algorithm 2, operating on the 32-byte SHA-256 fingerprint as a plain message. If `@noble/post-quantum` also exports `hashMl_dsa65`, that export MUST NOT be used. HashML-DSA.Sign (Algorithm 4, FIPS 204 §5.4) adds an internal pre-hashing step, which would double-hash the already-SHA-256'd fingerprint and produce non-interoperable signatures.

### Test Case Summary

| ID | Name | What it validates | Expected outcome |
|----|------|-------------------|-----------------|
| TC1 | Minimal mandate | Baseline: minimum required fields, single payee, correct integer/string serialization | ECDSA ✓, ML-DSA-65 ✓ |
| TC2 | Array ordering | JCS preserves insertion order; deliberately reverse-alphabetical payee array MUST NOT be sorted | ECDSA ✓, ML-DSA-65 ✓ |
| TC3 | Decimal normalization | RFC 8785 §3.2.2: `1.10 → 1.1`, `100.0 → 100`. String fields not normalized. | ECDSA ✓, ML-DSA-65 ✓ |
| TC4 | 7-year retention mandate | Retention metadata included in signed bytes; nested object keys sorted recursively; future dates accepted | ECDSA ✓, ML-DSA-65 ✓ |
| TC5 | Tamper detection | TC1 amount changed by 1 cent (`"125.00" → "125.01"`); original signatures applied to modified payload MUST fail both verifiers | ECDSA REJECT, ML-DSA-65 REJECT |

### TC5 — Tamper Detection Detail

TC5 is the security-critical assertion. The TC1 mandate has its `amount` field changed from `"125.00"` to `"125.01"` (one cent inflation). The TC1 signatures are applied to the modified payload. Both ECDSA P-256 and ML-DSA-65 verification MUST return `false`.

```json
{
  "id": "tc5-tamper-detection",
  "description": "TC1 +1 cent tamper — MUST fail for both ECDSA and ML-DSA-65",
  "ecdsa_verify_with_original_sig": false,
  "mldsa_verify_with_original_sig": false,
  "fingerprints_match": false
}
```

---

## §5 Reference Implementation

Reference implementation: [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe) under Apache-2.0. Browser-based verifier: [pqsafe.xyz/verify](https://pqsafe.xyz/verify).

### 5.1 TypeScript

```typescript
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa';
import canonicalize from 'canonicalize';  // RFC 8785 JCS
import { createHash } from 'node:crypto';

function pqSign(sdJwtHeader: string, sdJwtPayload: string, sk: Uint8Array): string {
  const jwsInput = `${sdJwtHeader}.${sdJwtPayload}`;
  const fingerprint = createHash('sha256').update(jwsInput).digest();
  // ML-DSA.Sign (Algorithm 2, FIPS 204 §5.2) — pass fingerprint as message
  // Do NOT use hashMl_dsa65 — would double-hash and produce non-interoperable signatures
  const sigma = ml_dsa65.sign(sk, fingerprint);
  return Buffer.from(sigma).toString('base64url');  // 4412 chars, unpadded
}

function pqVerify(sdJwtHeader: string, sdJwtPayload: string, pqSig: string, pk: Uint8Array): boolean {
  const jwsInput = `${sdJwtHeader}.${sdJwtPayload}`;
  const fingerprint = createHash('sha256').update(jwsInput).digest();
  const sigma = Buffer.from(pqSig, 'base64url');
  if (sigma.length !== 3309) return false;
  return ml_dsa65.verify(pk, fingerprint, new Uint8Array(sigma));
}

// Install: npm install @noble/post-quantum canonicalize
```

### 5.2 Python

```python
import hashlib, base64
from cryptography.hazmat.primitives.asymmetric.dilithium import (
    generate_private_key, MLDSAPrivateKey, MLDSAPublicKey
)

def pq_sign(sd_jwt_header: str, sd_jwt_payload: str, private_key: MLDSAPrivateKey) -> str:
    jws_input = f"{sd_jwt_header}.{sd_jwt_payload}".encode('ascii')
    fingerprint = hashlib.sha256(jws_input).digest()
    sigma = private_key.sign(fingerprint)
    return base64.urlsafe_b64encode(sigma).rstrip(b'=').decode('ascii')

def pq_verify(sd_jwt_header: str, sd_jwt_payload: str, pq_sig: str, public_key: MLDSAPublicKey) -> bool:
    jws_input = f"{sd_jwt_header}.{sd_jwt_payload}".encode('ascii')
    fingerprint = hashlib.sha256(jws_input).digest()
    padding = '=' * (4 - len(pq_sig) % 4) if len(pq_sig) % 4 else ''
    sigma = base64.urlsafe_b64decode(pq_sig + padding)
    if len(sigma) != 3309:
        return False
    try:
        public_key.verify(sigma, fingerprint)
        return True
    except Exception:
        return False

# Install: pip install cryptography
```

### 5.3 Go and Rust

**Go:** `github.com/cloudflare/circl/sign/mldsa/mldsa65` from Cloudflare's CIRCL library.

**Rust:** `ml-dsa` crate from the RustCrypto organization (pure Rust, no-std compatible).

In both languages: compute the SHA-256 digest of the JWS Signing Input, then pass the 32-byte digest as the message argument to the ML-DSA-65 sign or verify function. Encode the resulting signature bytes as Base64url (RFC 4648 §5, unpadded).

### 5.4 Performance

| Operation | Approx. latency (modern x86-64 or Apple M-series) |
|-----------|--------------------------------------------------|
| Key generation | ~0.5 ms |
| Sign | ~0.7 ms |
| Verify | ~0.3 ms |

These latencies are negligible relative to network round-trip times in AP2 payment flows. Throughput exceeding 1,000 operations per second per core is achievable.

---

## §6 Backward Compatibility

### 6.1 Guarantees for Existing Verifiers

Existing AP2 SD-JWT verifiers that do not implement this profile encounter mandate JWTs with `pq_alg` and `pq_sig` in the JWT header and MUST treat them as follows:

1. **Unrecognized header parameters.** Per RFC 7515 §4, JWT implementations SHOULD ignore header parameters whose names are not recognized.
2. **Classical signature unaffected.** The `alg: "ES256"` signature remains present and is verified independently.
3. **No wire format change.** The mandate remains an SD-JWT.
4. **SD-JWT payload and `_sd` structure unchanged.**

### 6.2 Dual-Signing Transition Protocol

| Phase | Timeline | Behavior |
|-------|----------|---------|
| Phase 0 — Announce | Now | Publish key rotation schedule; update API documentation |
| Phase 1 — Dual-sign optional | 2026 Q2–Q3 | Senders MAY attach `pq_alg`/`pq_sig` alongside classical `alg` |
| Phase 2 — Dual-sign required | 2026 Q4–2027 Q1 | All senders MUST include PQ header parameters; classical signature still verified |
| Phase 3 — PQ-only | 2027 Q2+ | Classical signature deprecated; ML-DSA-65 alone sufficient |

### 6.3 Key Rotation

ML-DSA-65 key pairs SHOULD be rotated at least annually for long-lived agent identities. Implementations MUST NOT reuse ML-DSA-65 key pairs for any purpose other than mandate signing.

---

## §7 Security Considerations

### 7.1 Classical Security Level

ML-DSA-65 targets NIST security Category 3, providing at least 128 bits of classical-equivalent security. This matches or exceeds AES-128 and SHA-256, considered sufficient for sensitive financial data under NIST SP 800-57 through at least 2030.

### 7.2 Post-Quantum Security Level

The security of ML-DSA-65 rests on the conjectured hardness of the Module Learning With Errors (MLWE) and Module Short Integer Solution (MSIS) problems. No known quantum speedup analogous to Shor's algorithm applies to these problems.

### 7.3 Hybrid vs. Pure-PQ — When to Use Which

**Use dual-signing (Phases 1–2) when:**
- Some verifiers in the ecosystem are not yet PQ-capable.
- Regulatory requirements mandate documented transition rather than immediate cutover.
- Defense-in-depth against ML-DSA-65 implementation defects is desired.

**Use pure ML-DSA-65 (Phase 3) when:**
- Deployment is in a jurisdiction with a hard regulatory mandate for PQ-only cryptography.
- All verifier implementations have confirmed ML-DSA-65 support.
- Mandate size constraints make carrying dual signatures infeasible.

### 7.4 Deterministic Signing

Unlike ECDSA, ML-DSA-65 does not require a per-signature random nonce `k`. The catastrophic nonce-reuse vulnerabilities that have historically caused private key extraction in ECDSA deployments are not present in ML-DSA-65.

### 7.5 Side-Channel Resistance

Implementations MUST use a constant-time ML-DSA-65 implementation. The `@noble/post-quantum` library employs constant-time arithmetic.

### 7.6 Signature Malleability

ML-DSA-65 signatures are non-malleable. The verification algorithm validates the full internal structure of the signature encoding.

### 7.7 Key Reuse Across Protocols

AP2 agents MUST NOT reuse their ML-DSA-65 key pair for any purpose other than AP2 mandate signing. The ML-DSA-65 secret key format is incompatible with ML-KEM (NIST FIPS 203) by design.

### 7.8 Input Length Enforcement

Receivers MUST enforce input length limits on the `pq_sig` header parameter. A conformant implementation MUST reject any `pq_sig` value that decodes to a byte length other than exactly 3,309 bytes (ML-DSA-65 mode) or 3,373 bytes (hybrid mode).

---

## §8 Open Questions

The following questions are submitted to the FIDO Alliance Payments TWG and the AP2 community for discussion.

- **Q1 — NIST IR 8547 scope:** Has NIST IR 8547 ipd compliance been discussed in the context of AP2 mandate retention requirements?
- **Q2 — Existing internal PQ work:** Has the AP2 team or the FIDO Payments TWG discussed ML-DSA-65 or any other PQ algorithm internally?
- **Q3 — Verification failure semantics for unresolvable keys:** If `pq_sig` is present and the corresponding public key cannot be resolved at verification time, should the profile mandate hard rejection (fail closed) or permit fallback to classical-only verification?
- **Q4 — Mastercard Verifiable Intent alignment:** Does the TWG see value in aligning the `pq_alg`/`pq_sig` header parameter extension with the Verifiable Intent document format?
- **Q5 — Scope: mandate credentials only, or also task results?**
- **Q6 — Retention-aware mandate field standardization:** Should the TWG consider standardizing retention metadata fields as part of the mandate credential schema?

---

## §9 References

### Normative References

- **[FIPS-204]** NIST. "Module-Lattice-Based Digital Signature Standard." FIPS 204, August 2024. [doi.org/10.6028/NIST.FIPS.204](https://doi.org/10.6028/NIST.FIPS.204)
- **[RFC-8785]** Rundgren, A., et al. "JSON Canonicalization Scheme (JCS)." RFC 8785, June 2020. [rfc-editor.org/rfc/rfc8785](https://www.rfc-editor.org/rfc/rfc8785)
- **[RFC-7515]** Jones, M., et al. "JSON Web Signature (JWS)." RFC 7515, May 2015. [rfc-editor.org/rfc/rfc7515](https://www.rfc-editor.org/rfc/rfc7515)
- **[RFC-2119]** Bradner, S. "Key words for use in RFCs to Indicate Requirement Levels." RFC 2119, March 1997.
- **[RFC-8174]** Leiba, B. "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words." RFC 8174, May 2017.
- **[RFC-4648]** Josefsson, S. "The Base16, Base32, and Base64 Data Encodings." RFC 4648, October 2006.
- **[AP2-SPEC]** AP2 Working Group. "AI Payments Protocol v2 Specification." [github.com/google-agentic-commerce/AP2](https://github.com/google-agentic-commerce/AP2)

### Informative References

- **[NIST-IR-8547]** NIST. "Transition to Post-Quantum Cryptography Standards." NIST IR 8547, 2024 (initial public draft). [csrc.nist.gov/pubs/ir/8547/ipd](https://csrc.nist.gov/pubs/ir/8547/ipd)
- **[HKMA-QPI]** Hong Kong Monetary Authority. "Quantum Preparedness Index (QPI)." Announced February 3, 2026. [hkma.gov.hk](https://www.hkma.gov.hk/)
- **[PSD2-ART69]** European Parliament and Council. "Directive (EU) 2015/2366 on Payment Services (PSD2)." Article 69. [eur-lex.europa.eu](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32015L2366)
- **[NOBLE-PQ]** Miller, P. "@noble/post-quantum." [github.com/paulmillr/noble-post-quantum](https://github.com/paulmillr/noble-post-quantum)
- **[CIRCL]** Cloudflare. "CIRCL: Cloudflare Interoperable Reusable Cryptographic Library." [github.com/cloudflare/circl](https://github.com/cloudflare/circl)
- **[PQSAFE-IMPL]** PQSafe. "PQSafe AgentPay Reference Implementation." Apache-2.0. [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe)

---

## §10 Authors and License

**Authors:** The founders of PQSafe AgentPay — [raymond@pqsafe.xyz](mailto:raymond@pqsafe.xyz) · [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe)

**License:** This specification document is released under the [Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0). The reference implementation at [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe) is also released under Apache-2.0. Copyright 2026 PQSafe.

**Acknowledgments:** The authors thank the AP2 working group for AP2 v0.1's foundational design choices — particularly the mandate of RFC 8785 JCS canonicalization, which simplifies this extension substantially. Thanks to Paul Miller for the `@noble/post-quantum` library and to the NIST post-quantum cryptography standardization team for FIPS 204.

### Document History

| Revision | Date | Summary |
|----------|------|---------|
| 00 | 2026-04-28 | Initial draft |
| 01 | 2026-05-01 | Full specification landing page; §3 wire format examples; 5 test vector cases TC1–TC5; §6 backward-compatibility guarantees; §7 security considerations; open questions expanded to 6 |
| 02 (v9) | 2026-05-01 | Core structural change: mechanism shifted from JSON payload fields to JOSE header parameters (`pq_alg`, `pq_sig`) — realignment with AP2 v0.2 SD-JWT architecture. HashML-DSA signing input corrected to JWS Signing Input per RFC 7515 §7.2.1. Hybrid profile defined. NIST IR 8547 consistently marked as initial public draft. |

---

AP2-PQ-EXT-01 rev 02 · 2026-05-01 · Copyright 2026 PQSafe · Apache-2.0
