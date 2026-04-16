# PQSafe

Post-quantum payment infrastructure for AI agents.

## The problem

AI agents can draft, research, schedule, and publish — but they can't pay for anything. Every payment still requires a human to log in. Credit card handover is insecure. API key sharing is unauditable. There is no standard for delegated spend authority that survives a quantum computer.

## The solution

PQSafe AgentPay lets a human sign a **spend envelope** — a cryptographically bound authorization that says *this agent can spend up to $X, to these recipients, via this rail, for this long*. The envelope is signed with ML-DSA-65 (NIST FIPS 204), the post-quantum signature standard. The agent presents the envelope to execute payments. No credit card sharing. No prompt injection escape. Full audit trail.

## Packages

| Package | Description | Status |
|---|---|---|
| [`agent-pay`](agent-pay/) | SDK — spend envelopes, ML-DSA-65 signing, multi-rail payment execution | **Live** — real Airwallex sandbox transfers verified. [Receipts](agent-pay/DEMO_RECEIPTS.md) |
| [`extension`](extension/) | Chrome extension — PQ wallet, key management, envelope signing UI | v0.2 |
| [`landing`](landing/) | pqsafe.xyz website | Live |

## Quick start

```bash
cd agent-pay
npm install
npm run demo          # mock mode — no credentials needed
npm test              # 13 guardrail tests
```

For real Airwallex sandbox payments, see [agent-pay/DEMO_RECEIPTS.md](agent-pay/DEMO_RECEIPTS.md).

## Architecture

```
Human (Chrome extension)
  └── PQSafe Wallet (ML-DSA-65 keypair)
        └── signEnvelope(envelope, sk, pk)
              │
              ▼
        SignedEnvelope
              │  (passed to agent — JSON + signature + pubkey)
              ▼
Agent process
  └── executeAgentPayment(signedEnvelope, request)
        ├── verifyEnvelope()     ← ML-DSA-65 signature check
        ├── allowlist check      ← recipient must be in envelope
        ├── amount ceiling       ← request.amount ≤ envelope.maxAmount
        ├── temporal window      ← now must be within validFrom..validUntil
        └── routePayment()       ← Airwallex / Wise / Stripe / USDC-Base / x402
              └── real payment rail API call
                    └── returns txId + receipt
```

## Why post-quantum

Every financial institution will migrate to PQ cryptography before 2035 (NIST mandate). Classical agent-payment systems (JWKS/JWT, ECDSA) will need to be replaced. PQSafe is native ML-DSA-65 from day one — no migration cost, no retrofit, no "we'll add PQ later" technical debt.

## License

MIT
