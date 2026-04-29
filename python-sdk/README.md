# pqsafe-agent-pay

[![PyPI](https://img.shields.io/pypi/v/pqsafe-agent-pay)](https://pypi.org/project/pqsafe-agent-pay/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Python SDK for PQSafe AgentPay — post-quantum signed payment authorization for AI agents.**

Part of the [PQSafe AgentPay](https://github.com/PQSafe/pqsafe) ecosystem. Uses ML-DSA-65 (NIST FIPS 204) for signing. Integrates with LangChain, CrewAI, AutoGen, and any custom Python agent.

---

## What it does

`pqsafe-agent-pay` lets a human wallet owner issue a cryptographically-bound **SpendEnvelope** to an AI agent. The envelope defines exactly what the agent can spend, to whom, and for how long — enforced by an ML-DSA-65 (NIST FIPS 204) post-quantum signature that the agent cannot exceed or forge.

The agent calls `pay(signed_envelope, recipient, amount, memo)` and the SDK verifies the signature, validates the policy constraints (amount ceiling, recipient allowlist, time window), and dispatches the payment over the configured rail. No centralized server. No long-lived credentials in your agent code. The envelope **is** the authorization.

---

## Install

```bash
pip install pqsafe-agent-pay
```

For local development:

```bash
git clone https://github.com/PQSafe/pqsafe
cd pqsafe/python-sdk
pip install -e ".[dev]"
```

---

## Quickstart

```python
from pqsafe import create_envelope, generate_keypair, pay, sign_envelope

# 1. Generate an ML-DSA-65 key pair (wallet owner, done once)
keypair = generate_keypair()

# 2. Create a SpendEnvelope — authorizes an AI agent to pay up to $10 USD
envelope = create_envelope(
    issuer="pq1" + "a" * 40,                    # wallet owner's PQSafe address
    agent="supplier-bot-v1",
    max_amount=10.00,
    currency="USD",
    allowed_recipients=["supplier-uuid-here"],
    ttl_seconds=3600,
)

# 3. Sign the envelope (post-quantum ML-DSA-65)
signed = sign_envelope(envelope, keypair)

# 4. Agent pays — all constraints enforced before dispatch
result = pay(
    signed,
    recipient="supplier-uuid-here",
    amount=5.00,
    memo="Invoice #42",
    dry_run=True,   # remove for live payments; set PQSAFE_API_KEY env var
)

print(result.tx_id)    # "dry-run-no-http" (dry_run) or live txId
print(result.status)   # "dry_run" or "success"
```

Set `PQSAFE_API_KEY` in your environment and remove `dry_run=True` for live calls.

---

## What you get

- **FIPS 204 ML-DSA-65 signing** — 128-bit post-quantum security; powered by `pqcrypto>=0.4.0`
- **Policy enforcement** — amount ceiling, recipient allowlist, and validity window enforced before any payment is dispatched
- **Replay protection** — 128-bit random nonce per envelope; envelopes cannot be reused
- **Multi-rail routing** — Airwallex (live sandbox), Wise, Stripe, USDC on Base, x402 via the PQSafe API
- **Framework plugins** — `langchain-pqsafe` and `crewai-pqsafe` wrap this SDK for one-line tool registration
- **AP2 adapter** — interop with [Google AP2 mandates](https://github.com/google-agentic-commerce/AP2) (`pqsafe.adapters`)
- **ACP adapter** — interop with [Stripe ACP Shared Payment Tokens](https://stripe.com/docs/agent-commerce) (`pqsafe.adapters`)
- **Spend policy modes** — `SingleUsePolicy`, `PerTxCapPolicy`, `CumulativeCapPolicy` via `pqsafe.sprint2`
- **Classical fallback** — if `pqcrypto` cannot be installed, Ed25519 is used (clearly marked; not post-quantum secure; not for production)

---

## API reference

### `generate_keypair() -> KeyPair`

Generate an ML-DSA-65 key pair. Returns a `KeyPair` with `.public_key` and `.secret_key` as raw bytes. Use `.public_key_hex()` and `.secret_key_hex()` for hex-encoded strings.

### `create_envelope(...) -> SpendEnvelope`

| Parameter | Type | Description |
|---|---|---|
| `issuer` | `str` | PQSafe address (`pq1` + 40 hex chars) |
| `agent` | `str` | Agent identifier (1–128 chars) |
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

### `pay(signed_envelope, ...) -> PaymentResult`

Verify the envelope and POST to `/v1/pay`. Accepts a `PaymentRequest`, plain dict, or keyword args (`recipient`, `amount`, `memo`, `api_key`, `base_url`, `dry_run`).

---

## Framework plugins

For LangChain or CrewAI agents, install the framework-specific plugin instead — it wraps this SDK as a drop-in tool:

```bash
pip install langchain-pqsafe   # LangChain tool: PQSafePaymentTool
pip install crewai-pqsafe      # CrewAI tool: PQSafePaymentTool
```

Both plugins use this SDK under the hood — same envelope format, same signature verification, same rails.

---

## Part of PQSafe AgentPay

- **[`@pqsafe/agent-pay`](https://www.npmjs.com/package/@pqsafe/agent-pay)** — core TypeScript SDK
- **[`@pqsafe/mastra`](https://www.npmjs.com/package/@pqsafe/mastra)** — Mastra workflow integration
- **[`langchain-pqsafe`](https://pypi.org/project/langchain-pqsafe/)** — LangChain tool
- **[`crewai-pqsafe`](https://pypi.org/project/crewai-pqsafe/)** — CrewAI tool

---

## Links

- **Main repo:** [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe)
- **Docs:** [docs.pqsafe.xyz](https://docs.pqsafe.xyz)
- **Live demo:** [demo.pqsafe.xyz](https://demo.pqsafe.xyz)
- **Website:** [pqsafe.xyz](https://pqsafe.xyz)

---

## License

MIT
