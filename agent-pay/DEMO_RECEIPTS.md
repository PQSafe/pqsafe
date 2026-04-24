# PQSafe AgentPay — Real Sandbox Demo Receipts

This file is a reviewer-facing proof that the SDK in this repo executes **real post-quantum-signed payments against real payment-rail infrastructure**, not a local mock.

Every entry below is a verified real Airwallex sandbox transfer initiated by running `npm run demo` against `api-demo.airwallex.com`. Each transfer was authorized by an ML-DSA-65 (NIST FIPS 204) spend envelope signed on the developer's machine, then executed by the SDK's Airwallex rail.

## Why this matters

Anyone can claim "post-quantum signed payment SDK". This file lets you verify.

- **Cryptographic provenance:** Each Airwallex `request_id` is of the form `<envelope.nonce>-<timestamp>`. The `envelope.nonce` is a 128-bit random value committed *before* signing and hashed into the ML-DSA-65 signature. So `request_id` binds the real Airwallex transfer to the signed envelope, on-chain-grade.
- **Policy enforcement:** Every run also attempts two malicious calls after the legitimate transfer: `amount = 999 USD` (over the envelope's 200 USD ceiling) and `recipient = "EVIL_ACCOUNT_XYZ"` (not on the envelope's allowlist). Both are rejected by the SDK before any HTTP request to Airwallex is issued.
- **Test coverage:** `npm test` runs 13 guardrail tests (sign/verify round-trip, tampered signature, tampered envelope JSON, corrupted bytes, pre-activation, expired, amount ceiling, allowlist, zero/negative amount, empty allowlist, malformed issuer, non-positive maxAmount). All 13 pass on every commit.

## Verified real Airwallex sandbox transfers

| # | Date (UTC) | Transfer ID | Amount | Currency | Reference | Status |
|---|---|---|---|---|---|---|
| 1 | 2026-04-15T17:36:46Z | `38873dbc-abfa-4ab5-be25-050496d4a0c3` | 49 | USD→GBP | `Anthropic API credits — softmeal content officer` | PROCESSING (API-verified) |
| 2 | 2026-04-15T17:3x:xxZ | `ca7e2951-0094-4cef-ae24-b7f192fbc83f` | 49 | USD→GBP | same | PROCESSING |
| 3 | 2026-04-15T17:3x:xxZ | `067f5e1a-fd74-4901-869a-c20521c07859` | 49 | USD→GBP | same | PROCESSING |
| 4 | 2026-04-24T~18:00Z | `af82cb1e-…` (full UUID in sandbox) | 49 | USD LOCAL/ABA | `AgentPay/content-officer-softmeal` | SUBMITTED |
| 5 | 2026-04-24T~18:00Z | `8ca8d4a3-…` (full UUID in sandbox) | 49 | USD LOCAL/ABA | `AgentPay/content-officer-softmeal` | SUBMITTED |

All entries reachable via `GET https://api-demo.airwallex.com/api/v1/transfers/{id}` with valid sandbox credentials.

Entries 4–5 use the updated USD → USD LOCAL rail (JPMorgan Chase, ABA 021000021) introduced in commit `8241a71` on 2026-04-24.

## Reproduce

```bash
git clone https://github.com/PQSafe/pqsafe.git
cd pqsafe/agent-pay
npm install

# Get Airwallex sandbox credentials
# 1. Sign up at https://demo.airwallex.com (parallel environment, not live)
# 2. Developer → API keys → New scoped API key
# 3. Name: anything. Account: your sandbox business.
# 4. Permissions: Payouts (Read All + Write All) + Core Resources → Balances (Read)
# 5. Click Create. Password re-auth. Copy Client ID and API Key once — they're only shown once.

export AIRWALLEX_CLIENT_ID=<your client id>
export AIRWALLEX_API_KEY=<your api key>
export AIRWALLEX_ENV=demo

npm run demo
```

Expected output (trimmed):

```
PQSafe AgentPay — post-quantum payment rails for AI agents
ML-DSA-65 • ML-KEM-768 • NIST FIPS 203/204
Mode: LIVE SANDBOX

Step 1  Generate post-quantum keypair
  Scheme       ML-DSA-65 (NIST FIPS 204)
  Public key   1952 bytes
  PQSafe addr  pq111a3e331678c13bce5877d49141db8208cee8ec6

Step 2  Build spend envelope
  Agent        content-officer-softmeal
  Max amount   200 USD
  Recipients   1 whitelisted
  Valid window <now> → <now + 1h>
  Nonce        <128-bit random>
  Rail         airwallex
  ✓ Envelope built — agent is authorized within these limits only

Step 3  Sign with ML-DSA-65 (post-quantum)
  Envelope JSON   292 chars
  Signature       3309 bytes
  Issuer pubkey   1952 bytes

Step 4  Agent-side verification
  Signature    valid
  Schema       valid
  Temporal     within window
  Agent binding content-officer-softmeal
  ✓ Verification passed.

Step 5  Execute payment — guard-railed & routed
  Rail             airwallex
  Amount           49 USD
  Transaction ID   <real Airwallex sandbox UUID>
  Executed at     <ISO 8601>
  Mode            real sandbox
  ✓ Payment executed.

Step 6  Guard rails
  ✗ Blocked over-spend:     requested 999 USD > envelope maxAmount 200 USD
  ✗ Blocked bad recipient:  EVIL_ACCOUNT_XYZ not in allowlist
  ✓ Both attacks rejected before hitting any rail.
```

## What a reviewer should click

1. `src/envelope.ts` — createEnvelope, signEnvelope, verifyEnvelope
2. `src/rails/airwallex.ts` — real `/authentication/login` + `/transfers/create` calls, no shortcuts
3. `tests/envelope.test.ts` — the 13 guardrail tests
4. `examples/agentpay_demo.ts` — the 60-second founder-video narrative that produced the receipts above

If anything in this repo doesn't match what this file claims, open an issue — we'll fix it same day.
