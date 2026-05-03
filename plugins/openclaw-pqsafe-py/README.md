# pqsafe-openclaw

**Post-quantum spend delegation for AI agents, available in Python via OpenClaw / ClawHub.**

[![PyPI](https://img.shields.io/pypi/v/pqsafe-openclaw)](https://pypi.org/project/pqsafe-openclaw/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue)](https://pypi.org/project/pqsafe-openclaw/)

---

## What this is

`pqsafe-openclaw` is a Python skill for the [OpenClaw](https://docs.openclaw.ai) / [ClawHub](https://clawhub.ai) AI agent runtime. It wraps the [PQSafe AgentPay](https://pqsafe.xyz) Python SDK and exposes four actions — `pay`, `set_envelope`, `query`, `verify_received` — as an OpenClaw-compatible skill that emits JSON responses the ClawHub TypeScript runtime can relay.

OpenClaw's [100+ skill catalog](https://clawhub.ai) primarily uses TypeScript. Python users who prefer the `pqsafe-agent-pay` Python SDK (42/42 tests passing) can use this package directly in LangChain, CrewAI, or AutoGen pipelines. For pure OpenClaw deployments, this package is invoked by the companion TypeScript bridge skill as a subprocess (`python -m pqsafe_openclaw <action> <json-args>`), following the cross-language bridge pattern documented in the OpenClaw skill format spec.

### Why SpendEnvelopes address the AI payment tool-call risk vector

Current AI agent payment implementations use tool calls where the agent constructs the payment itself — amount, recipient, and authorization in the same unverified step. A compromised or misaligned agent can redirect funds to arbitrary recipients. The March 2026 CAC/MIIT order in mainland China highlighted this attack surface explicitly (see [China compliance notes](#china-mainland-deployment) below).

PQSafe's SpendEnvelope approach structurally separates authorization from execution: the human issuer pre-signs an envelope that bounds the agent's maximum spend, which recipients it may pay, and for how long. The agent cannot exceed this bound even if fully compromised — the signature is ML-DSA-65 (NIST FIPS 204), and any modification invalidates it. The envelope format also supports dual-signing (ECDSA-P256 + ML-DSA-65) for regulatorily-required audit records under HKMA Cap. 615, PSD2 Article 69, and comparable long-retention frameworks. NIST IR 8547 (2024, initial public draft) proposes deprecation of ~112-bit classical algorithms by 2030; the HKMA announced its Quantum Preparedness Index on February 3, 2026. SpendEnvelopes signed today with ML-DSA-65 will remain cryptographically verifiable throughout their mandatory 5–7 year retention window.

---

## Installation

```bash
# Core (uses pqsafe-agent-pay SDK with Ed25519 classical fallback if pqcrypto unavailable)
pip install pqsafe-openclaw

# Full post-quantum backend (recommended for production)
pip install "pqsafe-openclaw[pq]"

# AP2 dual-signing (ML-DSA-65 + ECDSA-P256)
pip install "pqsafe-openclaw[ap2]"

# Development / testing
pip install "pqsafe-openclaw[dev]"
```

---

## Quick start

```python
from pqsafe_openclaw import PQSafeSkill

skill = PQSafeSkill(mock_mode=True)  # mock_mode=False requires PQSAFE_API_KEY

result = skill.pay(
    issuer="pq1" + "a" * 40,           # your PQSafe wallet address
    agent="my-coo-v1",                 # agent identifier
    recipient="did:web:vendor.com:payee:main",
    amount=125.0,
    currency="HKD",
    rail="airwallex",
)

print(result.to_json(indent=2))
# {
#   "ok": true,
#   "action": "pay",
#   "result": {
#     "tx_id": "awx_sbx_1746123456789_a1b2c3d4",
#     "status": "mock_confirmed",
#     "rail": "airwallex",
#     "amount": 125.0,
#     "currency": "HKD",
#     ...
#   }
# }
```

---

## API

### `PQSafeSkill`

```python
from pqsafe_openclaw import PQSafeSkill

skill = PQSafeSkill(
    api_key=None,           # falls back to PQSAFE_API_KEY env var
    mock_mode=True,         # True = no HTTP, realistic mock results
    base_url="https://api.pqsafe.xyz",
)
```

#### `skill.pay(issuer, agent, recipient, amount, currency, ...)`

Build a SpendEnvelope, sign with ML-DSA-65, run all guardrails (signature, recipient allowlist, amount ceiling), submit to PQSafe API (or mock).

Returns `SkillResult` with `tx_id`, `status`, `rail` on success.

#### `skill.set_envelope(issuer, agent, max_amount, currency, allowed_recipients, ...)`

Pre-build and sign a SpendEnvelope for multi-payment reuse. Returns the signed envelope JSON for storage and repeated use without re-signing.

#### `skill.query(tx_id)`

Query transaction status. In mock mode, infers rail from `tx_id` prefix.

#### `skill.verify_received(envelope, mldsa_public_key_hex, ...)`

Verify an inbound dual-signed AP2 mandate. Checks ML-DSA-65 signature, optionally ECDSA-P256, optionally expected recipient. Used by the receiver side of an agent payment.

---

## AP2 dual-signing

```python
from pqsafe_openclaw import build_ap2_envelope, verify_ap2_envelope
from pqsafe_openclaw.envelope import (
    AP2Mandate,
    generate_mldsa_keypair,
    generate_ecdsa_keypair,
)

mldsa_kp = generate_mldsa_keypair()   # ML-DSA-65 (1952-byte public key)
ecdsa_kp = generate_ecdsa_keypair()   # ECDSA-P256 (33-byte compressed pubkey)

mandate = AP2Mandate(
    agent_id="did:web:agents.pqsafe.xyz:my-agent",
    amount="125.00",
    currency="HKD",
    nonce="6b86b273ff34fce19d6b804eff5a3f57",
    recipient="did:web:seniordeli.com:payee:main",
    pq_algorithm="ML-DSA-65",
    pq_canonicalization="JCS",
)

signed = build_ap2_envelope(mandate, ecdsa_kp, mldsa_kp)
envelope_dict = signed.to_dict()
# envelope_dict["signature"]["alg"] == "ap2-ecdsa-p256+ap2-mldsa65"

verify_ap2_envelope(
    envelope_dict=envelope_dict,
    mldsa_public_key=mldsa_kp.public_key,
    ecdsa_public_key_compressed_hex=ecdsa_kp.public_key_compressed_hex,
)  # raises ValueError if invalid
```

### Signing pipeline (HashML-DSA mode)

Following AP2 RFC v8 §"Proposed Solution":
1. Serialize mandate body (without `signature` field) to RFC 8785 JCS canonical bytes.
2. ECDSA-P256: sign the raw JCS bytes → DER → Base64url (RFC 4648 §5, unpadded).
3. ML-DSA-65 (HashML-DSA): `SHA-256(JCS bytes)` → sign the 32-byte digest → Base64url.

HashML-DSA (SHA-256 pre-hash per FIPS 204 §5.4) is used rather than pure-mode ML-DSA. Pure-mode and HashML-DSA produce non-interoperable signatures — verifiers must match the mode. The test vectors in `03_pqsafe_ap2_test_vectors_RESULTS.json` were generated in pure-mode by the TypeScript reference; the OpenClaw AP2 envelope module uses HashML-DSA for AP2 compliance.

**Arg-order note:** `pqcrypto.sign.ml_dsa_65.sign(secret_key, message)` takes the secret key first. This is the opposite of `@noble/post-quantum` v0.6.0 which takes `(message, secretKey)`. The integration tests include a dedicated arg-order regression guard.

---

## Payment rails

| Rail | Status | Currencies | Notes |
|---|---|---|---|
| `airwallex` | live-sandbox | HKD, USD, EUR, GBP, AUD, SGD, CNY | YC W17, 5 live sandbox transfers confirmed |
| `wise` | live-sandbox | USD, EUR, GBP, HKD, AUD, CAD, JPY, SGD | IBAN, UK sort code, US ABA auto-detection |
| `stripe` | mock | USD, EUR, GBP, HKD + more | invoice / PaymentIntent / payment link |
| `usdc-base` | mock | USDC | ERC-20 on Base L2, Coinbase CDP compatible |
| `x402` | mock | USDC, ETH | HTTP 402 handshake, Coinbase x402 protocol |

```python
from pqsafe_openclaw.rails import select_rail

rail = select_rail("HKD", "did:web:vendor.com:payee")
# → RailInfo(rail_id="airwallex", status="live-sandbox", ...)

rail = select_rail("USDC", "https://api.service.com/pay")
# → RailInfo(rail_id="x402", ...)
```

---

## Test vector cross-language compatibility

The TypeScript reference implementation (`@noble/post-quantum` v0.6.0 + `@noble/curves` v1.4.0 + `canonicalize` v2.0.0) generated 5 test vectors (TC1-TC5), all verified (`ecdsa_verify: true`, `mldsa_verify: true`). The Python test suite confirms:

- JCS canonical bytes from Python `canonicaljson` match TypeScript byte-for-byte (TC1-TC4)
- TypeScript-generated ML-DSA-65 signatures verify with Python `pqcrypto` (TC1-TC4)
- Dual-signed envelope structure (`alg: "ap2-ecdsa-p256+ap2-mldsa65"`) is consistent

This is the primary proof of cross-language interoperability between the TypeScript and Python implementations. An agent signed by the TypeScript SDK can be verified by a Python receiver without re-signing.

```bash
# Run JCS + cross-language interop tests (requires pqcrypto + the vector file)
PQSAFE_VECTOR_FILE=path/to/03_pqsafe_ap2_test_vectors_RESULTS.json pytest tests/test_skill.py -v
```

---

## OpenClaw TypeScript bridge

Python skills integrate with the OpenClaw TS runtime via subprocess:

```typescript
// In your SKILL.md-companion TypeScript entry point:
import { execSync } from "child_process";

const args = JSON.stringify({ issuer, agent, recipient, amount, currency });
const output = execSync(`python -m pqsafe_openclaw pay '${args}'`, {
  env: { ...process.env, PQSAFE_MOCK_MODE: "1" },
}).toString();

const result = JSON.parse(output);
// result.ok, result.result.tx_id, result.result.status, ...
```

Or use the CLI directly:

```bash
python -m pqsafe_openclaw pay '{"issuer":"pq1aaa...","agent":"coo","recipient":"did:web:...","amount":25.0,"currency":"HKD"}'
```

---

## China (mainland) deployment

The People's Republic of China Cyberspace Administration (CAC) and MIIT issued a joint administrative order in March 2026 that requires SM2+SM3 cryptography for AI agent financial records in mainland China. ML-DSA-65 (NIST FIPS 204) and ECDSA-P256 are NOT OSCCA-approved for this use.

`pqsafe-openclaw` v0.1 uses NIST algorithms and is **not suitable for mainland China financial deployments** without SM2+SM3 support. Setting `PQSAFE_CN_DEPLOY=1` will raise `NotImplementedError` on any signing or payment call to prevent accidental non-compliant deployment.

Hong Kong is unaffected — the HKMA's Quantum Preparedness Index (February 3, 2026) aligns with NIST FIPS 204. Taiwan's FSC has not issued comparable restrictions.

SM2/SM3 support is on the PQSafe roadmap. Contact raymond@pqsafe.xyz for the implementation timeline.

---

## License

Apache-2.0. See [LICENSE](LICENSE).

---

## Links

- PQSafe handbook: https://pqsafe.xyz/handbook
- PQSafe GitHub: https://github.com/PQSafe/pqsafe
- AP2 PQ extension RFC: https://pqsafe.xyz/ap2-pq-rfc
- OpenClaw docs: https://docs.openclaw.ai
- ClawHub registry: https://clawhub.ai
- PyPI: https://pypi.org/project/pqsafe-openclaw/
- Contact: raymond@pqsafe.xyz
