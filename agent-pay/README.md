# @pqsafe/agent-pay

Post-quantum signed spend envelopes for AI agent payments, routed across multiple payment rails.

## What it is

AgentPay lets a human wallet owner issue a cryptographically-bound **SpendEnvelope** to an AI agent. The envelope defines exactly what the agent can spend, to whom, via which rail, and for how long — enforced by an ML-DSA-65 signature that no current or near-future adversary can forge.

The agent calls `executeAgentPayment(signedEnvelope, request)` and the SDK:
1. Verifies the PQ signature
2. Validates the envelope schema and temporal window
3. Checks the recipient against the allowlist
4. Enforces the amount ceiling
5. Routes to the correct payment rail (Airwallex, Wise, Stripe, USDC on Base, or x402)

No centralized server. No API key storage in the SDK. The envelope IS the authorization.

## Dogfood use case — Raymond's 8 ventures

Raymond runs 8 ventures with a zero-headcount back-office model. AI operators (content officers, procurement bots, invoicing agents) handle routine payments autonomously. Without AgentPay, each autonomous payment would require human approval — eliminating the speed advantage.

With AgentPay, Raymond issues scoped envelopes from his PQSafe wallet:

| Agent | Envelope | Rail |
|---|---|---|
| SeniorDeli supplier bot | ≤ HKD 2000, suppliers allowlist, 7d TTL | airwallex |
| DSE platform hosting bot | ≤ USD 50, Cloudflare only, monthly | stripe |
| LinPig trading settlement | ≤ USDC 1000, specific wallet, 1h TTL | usdc-base |
| Content CDN renewal bot | ≤ USD 20, Cloudflare only, 30d TTL | stripe |

Every payment is cryptographically bound to a specific envelope, logged with the agent ID and envelope nonce — full audit trail, zero manual approvals.

## Installation

```bash
npm install @pqsafe/agent-pay
```

## Usage

```typescript
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { createEnvelope, signEnvelope, executeAgentPayment } from '@pqsafe/agent-pay'

// Issue envelope from wallet
const envelope = createEnvelope({
  issuer: 'pq1a1b2c3d...',           // your PQSafe address
  agent: 'raymond-ai-coo-v1',
  maxAmount: 100,
  currency: 'USD',
  allowedRecipients: ['anthropic.com/billing'],
  ttlSeconds: 3600,
  rail: 'airwallex',
})

const signed = signEnvelope(envelope, dsaSecretKey, dsaPublicKey)

// Agent-side: execute payment
const result = await executeAgentPayment(signed, {
  recipient: 'anthropic.com/billing',
  amount: 50,
  memo: 'Invoice #42',
})

console.log(result.txId)
```

## Rails

| Rail | Status | Notes |
|---|---|---|
| `airwallex` | **Live sandbox** | OAuth2 client-credentials + `/transfers/create`. Real transfers verified — see [DEMO_RECEIPTS.md](DEMO_RECEIPTS.md) |
| `wise` | Stub | Wise Business API |
| `stripe` | Stub | Stripe PaymentIntents |
| `usdc-base` | Stub | Coinbase CDP / viem on Base |
| `x402` | Stub | HTTP 402 micropayment protocol |

## Architecture

```
wallet (extension)
  └─ createEnvelope() + signEnvelope()   ← envelope.ts
       │
       ▼
  SignedEnvelope (passed to agent)
       │
       ▼
  executeAgentPayment()                  ← index.ts
    ├─ verifyEnvelope()                  ← ML-DSA-65 verify
    ├─ allowlist check
    ├─ amount ceiling check
    └─ routePayment()                    ← rails/index.ts
         └─ airwallex / wise / stripe / usdc-base / x402
```

## Demo

```bash
# Mock mode (no creds needed)
npm run demo

# Real Airwallex sandbox
export AIRWALLEX_CLIENT_ID=<your sandbox client id>
export AIRWALLEX_API_KEY=<your sandbox api key>
export AIRWALLEX_ENV=demo
npm run demo
```

See [DEMO_RECEIPTS.md](DEMO_RECEIPTS.md) for verified real sandbox transfer IDs with cryptographic provenance.

## Tests

```bash
npm test    # 13 guardrail tests — sign/verify, tamper detection, policy enforcement
```

## Security model

- **ML-DSA-65** (NIST FIPS 204) — 128-bit post-quantum security for signing
- Envelopes are replay-protected by a 128-bit random nonce
- Time-bounded by `validFrom` / `validUntil`
- Recipient allowlist is part of the signed payload — cannot be altered without invalidating the signature
- The SDK never stores keys — caller provides them per-call

## Relationship to PQSafe extension

The Chrome extension (`pqsafe-extension`) provides the wallet UI and key management. The `spendEnvelope.ts` wrapper in the extension calls into this SDK's `createEnvelope` and `signEnvelope` using `wallet.dsa.secretKey`.
