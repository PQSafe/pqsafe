---
title: "Post-Quantum considerations for AP2 + Verifiable Intent — PQSafe open letter to FIDO Alliance"
url: https://pqsafe.xyz/fido-pq-letter/
type: standard-letter
---

# Post-Quantum considerations for AP2 + Verifiable Intent

**Open Letter to the FIDO Alliance Agentic Authentication and Payments Technical Working Groups**

Published: Saturday, May 2, 2026

---

## Addressed to

- **Andrew Shikiar** — Executive Director and CEO, FIDO Alliance
- **Jonathan Grossar** — Vice President, Product Management, Mastercard — Payments TWG chair
- **Henna Kapur** — Director, Authentication Products Development, Visa — Payments TWG co-chair
- **Christiaan Brand** — Product Manager: Identity and Security, Google — Agentic Authentication TWG co-chair
- **Nick Steele** — Member of Technical Staff, OpenAI — Agentic Authentication TWG co-chair
- **Dr. Abbie Barbir** — Senior Security Advisor, CVS Health — Agentic Authentication TWG co-chair

---

Dear Andrew, Jonathan, Henna, Christiaan, Nick, Abbie, and members of the FIDO Alliance Payments and Agentic Authentication Technical Working Groups,

We write as practitioners building post-quantum payment signing infrastructure for agent-initiated commerce. The FIDO Alliance's April 28, 2026 announcement — establishing two new technical working groups drawing on Google's Agent Payments Protocol and Mastercard's Verifiable Intent — is the correct institutional move at the right moment. We are writing to contribute a technically concrete post-quantum signing profile to the TWGs' standards work at the earliest point in the process.

The authors of this letter are the founders of PQSafe AgentPay, building open-source post-quantum signing infrastructure for AI agent payment authorization under Apache-2.0. This letter accompanies our reference implementation.

### The technical observation: AP2 v0.2's SD-JWT header placement makes this extension straightforward.

AP2 v0.2, released April 28, specifies SD-JWT mandate credentials with `"alg": "ES256"` in the JOSE JWT header — elliptic curve signatures at approximately 112-bit classical security. Because the signing algorithm lives in the header rather than the mandate payload body, introducing a post-quantum identifier requires no new payload fields and no structural departure from AP2's existing SD-JWT architecture. The cleanest migration path is a `pq_alg` JOSE header parameter — backward-compatible with classical verifiers, requiring no payload modification. The architecture AP2 v0.2 chose makes this extension straightforward rather than invasive.

### The regulatory backdrop: retention windows make this a near-term concern, not a 2030 theory.

Financial institutions under HKMA (Cap. 615) and PSD2 Article 69 must retain payment authorization records for five to seven years. NIST IR 8547 (initial public draft) proposes deprecation of 112-bit classical algorithms by 2030, with full disallowance by 2035. An `"alg": "ES256"` mandate committed to an immutable audit ledger in 2026 may be within its mandatory retention window when cryptographically-relevant quantum computers arrive — creating retrospective signature forgery risk on long-lived financial authorization records. This is a concrete compliance question for the specific category of records that AP2 and Verifiable Intent are designed to produce.

The HKMA announced its Quantum Preparedness Index on February 3, 2026 — a verified announcement, not a current mandate, signaling that post-quantum readiness has moved from research posture to regulatory expectation for Hong Kong-regulated institutions. Sumsub's 2025 Fraud Report documents 180% year-over-year growth in sophisticated AI-assisted multi-step fraud — the precise attack vector that mandate credentials must defend against. The intersection of retention windows and escalating AI-assisted fraud creates the right moment for an optional post-quantum signing layer in the TWGs' mandate specification work.

### The proposal: a `pq_alg` JOSE header parameter with `ES256+ML-DSA-65` hybrid profile.

We propose two new JOSE header parameters: `pq_alg`, identifying the post-quantum or hybrid algorithm, and `pq_sig`, carrying the post-quantum signature over the JWS Signing Input (RFC 7515 §7.2.1), Base64url-encoded. The primary algorithm identifier is `"ML-DSA-65"` (FIPS 204; OID `2.16.840.1.101.3.4.3.18`; with the NIST IR 8547 initial public draft qualifier until finalized). A hybrid profile, `"ES256+ML-DSA-65"`, is defined for deployments requiring both classical interoperability and quantum resistance.

ML-DSA-65 at 3,309 bytes is preferred over Falcon-512 (timing side-channel risk from constant-time floating-point arithmetic requirements) and SLH-DSA (7,856–49,856-byte signatures impractical for per-transaction mandate payloads). Implementations use HashML-DSA mode (SHA-256 pre-hash per FIPS 204 §5.4) over the JWS Signing Input — an explicit interoperability note distinguishes this from pure-mode ML-DSA-65 verifiers.

The extension is backward-compatible: classical verifiers that do not recognize `pq_alg` continue to verify the `alg: "ES256"` signature and ignore the additional header parameters. No changes to the SD-JWT payload or `_sd` claim structure are required.

### On Mastercard Verifiable Intent.

Verifiable Intent is functionally adjacent to the SpendEnvelope construct in our reference implementation — both are tamper-evident, user-authorized records of agent permissions. No public schema for Verifiable Intent has been released as of this writing; we make no claim about Mastercard's cryptographic design choices. Our proposal is intentionally format-agnostic at the signing layer: the `pq_alg` parameter applies to any mandate credential the TWGs standardize — AP2 SD-JWT, Verifiable Intent document, or any successor format.

### What we are offering.

A working Apache-2.0 reference implementation is at [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe): five deterministic test cases (TC1–TC5) reproducible on Mac, Linux x86-64, and Windows under GitHub Actions CI; TypeScript and Python verifiers; and a browser-based verifier at [pqsafe.xyz/verify](https://pqsafe.xyz/verify). The full JOSE header parameter specification is at [pqsafe.xyz/ap2-pq-rfc](https://pqsafe.xyz/ap2-pq-rfc).

---

## Three specific questions for the TWG chairs

We are not asking the FIDO Alliance to adopt our implementation. We are asking three things of the working groups:

1. Has the Payments TWG considered mandatory retention windows under HKMA and PSD2 as a near-term driver for optional post-quantum signing in mandate credentials — separate from general quantum-proofing timelines — and if so, is this within scope for the initial mandate credential specification?

2. Has the Agentic Authentication TWG discussed algorithm agility in the JOSE header for AP2-style mandate credentials, and is there an existing charter item or issue tracker where a `pq_alg` profile contribution should be filed?

3. If the TWGs find value in the reference implementation and deterministic test vectors, what is the preferred path for contributing an external Apache-2.0 artifact to the FIDO conformance testing process — and what is the preferred liaison mechanism for non-member organizations?

We are ready to engage through a FIDO member organization, submit a formal liaison document, or participate through any mechanism the Alliance prefers. The reference implementation is available now. We welcome the dialogue.

---

## Authors

The founders of PQSafe AgentPay

PQSafe AgentPay — [pqsafe.xyz](https://pqsafe.xyz)

---

## References

- FIDO Alliance — Agentic Authentication and Payments TWG announcement (April 28, 2026): [fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/](https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/)
- Google Agent Payments Protocol (AP2) v0.2 — SD-JWT mandate credential specification
- NIST FIPS 204 — Module-Lattice-Based Digital Signature Standard (ML-DSA): [csrc.nist.gov/pubs/fips/204/final](https://csrc.nist.gov/pubs/fips/204/final)
- NIST IR 8547 (initial public draft) — Transition to Post-Quantum Cryptography Standards: [csrc.nist.gov/pubs/ir/8547/ipd](https://csrc.nist.gov/pubs/ir/8547/ipd)
- IETF RFC 7515 — JSON Web Signature (JWS): [datatracker.ietf.org/doc/html/rfc7515](https://datatracker.ietf.org/doc/html/rfc7515)
- HKMA Quantum Preparedness Index — verified announcement, February 3, 2026: [hkma.gov.hk](https://www.hkma.gov.hk)
- Sumsub Identity Fraud Report 2025 — 180% year-over-year growth in AI-assisted multi-step fraud
- ML-DSA-65 OID `2.16.840.1.101.3.4.3.18` — NIST CSOR: [csrc.nist.gov/projects/computer-security-objects-register](https://csrc.nist.gov/projects/computer-security-objects-register)
- [PQSafe AgentPay AP2-PQ JOSE Header Profile Specification](https://pqsafe.xyz/ap2-pq-rfc)
- [PQSafe AgentPay reference implementation and test vectors (Apache-2.0)](https://github.com/PQSafe/pqsafe)

---

© 2026 PQSafe AgentPay — Licensed under [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) — Contact: [raymond@pqsafe.xyz](mailto:raymond@pqsafe.xyz)
