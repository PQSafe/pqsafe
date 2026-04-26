# pqsafe-agent-pay

Python SDK for PQSafe AgentPay — post-quantum safe payments for AI agents.

Uses ML-DSA-65 (NIST FIPS 204) for signing. Works with LangChain, CrewAI, AutoGen, and custom Python agents.

## Install

```bash
pip install pqsafe-agent-pay
```

Or for local development:

```bash
git clone https://github.com/PQSafe/pqsafe
cd pqsafe/python-sdk
pip install -e ".[dev]"
```

## 30-second example

```python
from pqsafe import create_envelope, generate_keypair, pay, sign_envelope

# 1. Generate an ML-DSA-65 key pair (issuer/wallet owner)
keypair = generate_keypair()

# 2. Create a SpendEnvelope authorizing an AI agent to pay up to $10 USD
envelope = create_envelope(
    issuer="pq1" + "a" * 40,           # wallet owner's PQSafe address
    agent="my-ai-agent-v1",
    max_amount=10.00,
    currency="USD",
    allowed_recipients=["38873dbc-abfa-4ab5-be25-050496d4a0c3"],
    ttl_seconds=3600,
)

# 3. Sign the envelope
signed = sign_envelope(envelope, keypair)

# 4. Agent pays (dry_run=True skips HTTP — remove for live payments)
result = pay(
    signed,
    recipient="38873dbc-abfa-4ab5-be25-050496d4a0c3",
    amount=5.00,
    memo="supplier invoice #42",
    dry_run=True,
)

print(result.tx_id)    # "dry-run-no-http"
print(result.status)   # "dry_run"
```

Set `PQSAFE_API_KEY` in your environment and remove `dry_run=True` for live calls.

## API reference

### `generate_keypair() -> KeyPair`

Generate an ML-DSA-65 key pair. Returns a `KeyPair` with `.public_key` and `.secret_key` as raw bytes. Use `.public_key_hex()` and `.secret_key_hex()` for hex-encoded strings.

### `create_envelope(...) -> SpendEnvelope`

Build a new unsigned `SpendEnvelope`. Parameters:

| Parameter | Type | Description |
|---|---|---|
| `issuer` | `str` | PQSafe address (`pq1` + 40 hex chars) |
| `agent` | `str` | Agent identifier (1-128 chars) |
| `max_amount` | `float` | Maximum spend allowed |
| `currency` | `str` | ISO 4217 currency code (e.g. `"USD"`) |
| `allowed_recipients` | `list[str]` | Allowlist of recipient addresses |
| `starts_in_seconds` | `int` | Delay before activation (default 0) |
| `ttl_seconds` | `int` | Validity window in seconds (default 3600) |
| `rail` | `str \| None` | Optional rail constraint |

### `sign_envelope(envelope, keypair) -> SignedEnvelope`

Sign a `SpendEnvelope` with the issuer's ML-DSA-65 key pair.

### `verify_envelope(signed, public_key=None) -> SpendEnvelope`

Verify a `SignedEnvelope`. Raises `ValueError` on invalid signature or expired envelope.

### `pay(signed_envelope, request=None, *, recipient=None, amount=None, memo=None, api_key=None, base_url='https://api.pqsafe.xyz', dry_run=False) -> PaymentResult`

Verify the envelope and POST to `/v1/pay`. Accepts a `PaymentRequest`, plain dict, or keyword args.

## AP2 adapter (v0.1.1)

Convert between [AP2 mandates](https://github.com/google-agentic-commerce/AP2) and PQSafe SpendEnvelopes:

```python
from pqsafe.adapters import ap2_mandate_to_spend_envelope, spend_envelope_to_ap2_mandate, IntentMandate

# IntentMandate → SpendEnvelope
mandate = IntentMandate(
    mandateId="m-001",
    merchantId="merchant-xyz",
    description="Purchase intent",
    maxAmount=100.0,
    currency="USD",
    expiresAt="2026-12-31T23:59:59Z",
    agentId="my-agent-v1",
    issuerAddress="pq1" + "a" * 40,
)
envelope = ap2_mandate_to_spend_envelope(mandate, issuer_address="pq1" + "a" * 40, ttl_seconds=3600)

# SpendEnvelope → CartMandate
cart = spend_envelope_to_ap2_mandate(envelope, "cart")

# Verify an AP2 mandate with a PQ signature
from pqsafe.adapters import verify_ap2_with_pq_wrapper
valid = verify_ap2_with_pq_wrapper(mandate, pq_sig_bytes, pq_public_key_bytes)
```

## ACP adapter (v0.1.1)

Convert between [Stripe ACP Shared Payment Tokens](https://stripe.com/docs/agent-commerce) and SpendEnvelopes:

```python
from pqsafe.adapters import acp_token_to_spend_envelope, spend_envelope_to_acp_token, SharedPaymentToken

spt = SharedPaymentToken(...)  # from Stripe API
envelope = acp_token_to_spend_envelope(spt, issuer_address="pq1" + "a" * 40)

# Back to SPT creation params (for POST /v1/shared_payment_tokens)
params = spend_envelope_to_acp_token(envelope, payment_method_id="pm_123")
```

Zero-decimal currencies (JPY, KRW, etc.) are handled automatically — no manual division by 100.

## Sprint 2: Spend Policy (v0.1.1)

Three policy modes for SpendEnvelopes:

```python
from pqsafe.sprint2 import SingleUsePolicy, PerTxCapPolicy, CumulativeCapPolicy
from pqsafe.sprint2 import validate_spend_policy, assert_policy_consistency

policy = validate_spend_policy({"mode": "per_tx_cap", "perTxLimit": 25.0})
assert_policy_consistency(policy, max_amount=100.0)  # validates perTxLimit <= maxAmount
```

Revocation and issuer hierarchy stubs are included (Sprint 3 implementation: May 19 – Jun 8).

## Links

- Handbook: https://pqsafe.xyz/handbook
- TypeScript SDK: https://github.com/PQSafe/pqsafe/tree/main/agent-pay
- LangChain plugin: `pip install langchain-pqsafe`
- CrewAI plugin: `pip install crewai-pqsafe`

## Cryptographic backend

The SDK uses ML-DSA-65 (NIST FIPS 204) via `pqcrypto>=0.4.0`. If pqcrypto cannot be installed, a classical Ed25519 fallback is used (clearly marked in the code with TODO comments). The fallback is not post-quantum secure and must not be used in production.

## License

MIT
