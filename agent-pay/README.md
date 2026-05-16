# @pqsafe/agent-pay

[![Unit Tests](https://github.com/PQSafe/pqsafe/actions/workflows/test.yml/badge.svg)](https://github.com/PQSafe/pqsafe/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/PQSafe/pqsafe/branch/main/graph/badge.svg)](https://codecov.io/gh/PQSafe/pqsafe)
[![npm](https://img.shields.io/npm/v/@pqsafe/agent-pay)](https://www.npmjs.com/package/@pqsafe/agent-pay)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**Post-quantum signed payment authorization for AI agents — FIPS 204 (ML-DSA-65) enforced, multi-rail.**

---

## What it does

`@pqsafe/agent-pay` lets a human operator issue a cryptographically-bound **SpendEnvelope** to an AI agent. The envelope defines exactly what the agent can spend, to whom, via which payment rail, and for how long — enforced by an ML-DSA-65 (NIST FIPS 204) signature that no current or near-future adversary can forge.

The agent calls `executeAgentPayment(signedEnvelope, request)` and the SDK verifies the post-quantum signature, validates the envelope's policy constraints (amount ceiling, recipient allowlist, time window), and routes the payment across the configured rail. No centralized server. No API key stored in the SDK. The envelope **is** the authorization — it travels with the agent and is self-contained.

## Why use it

AI agents increasingly make real financial decisions: renewing subscriptions, paying suppliers, settling invoices. Current agent payment patterns rely on long-lived API keys or OAuth tokens — credentials that can be stolen, replayed, or overspent. PQSafe AgentPay replaces that model with cryptographically-scoped, time-bounded, post-quantum-resistant envelopes. If a quantum computer breaks classical ECDSA tomorrow, your agent authorizations remain valid. If an agent is compromised, its envelope cannot exceed the cap or pay outside the allowlist.

---

## Install

```bash
# ESM / TypeScript (recommended)
npm install @pqsafe/agent-pay

# CommonJS
npm install @pqsafe/agent-pay
# CJS build is included — require('@pqsafe/agent-pay') works out of the box
```

---

## Quickstart

```typescript
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { createEnvelope, signEnvelope, executeAgentPayment } from '@pqsafe/agent-pay'

// 1. Operator issues a scoped envelope
const envelope = createEnvelope({
  issuer: 'pq1a1b2c3d...',           // PQSafe address
  agent: 'supplier-bot-v1',
  maxAmount: 200,
  currency: 'USD',
  allowedRecipients: ['supplier.example.com/billing'],
  ttlSeconds: 3600,
  rail: 'airwallex',
})

const signed = signEnvelope(envelope, dsaSecretKey, dsaPublicKey)

// 2. Agent executes payment — envelope enforces all constraints
const result = await executeAgentPayment(signed, {
  recipient: 'supplier.example.com/billing',
  amount: 150,
  memo: 'Invoice #42',
})

console.log(result.txId)    // e.g. "airwallex-tx-abc123"
console.log(result.status)  // "success"
console.log(result.rail)    // "airwallex"
```

---

## What you get

- **FIPS 204 ML-DSA-65 signing** — 128-bit post-quantum security; envelopes are quantum-resistant by default
- **Policy enforcement** — amount ceiling, recipient allowlist, and validity window checked before any payment is dispatched
- **Replay protection** — 128-bit random nonce per envelope; no envelope can be reused
- **Multi-rail routing** — Airwallex (live sandbox), Wise, Stripe, USDC on Base, and x402 (stubs ready)
- **Arbitrum audit anchoring** — optional on-chain commitment of envelope hash + signature fingerprint for immutable audit trails
- **Zero key storage** — the SDK never persists private keys; caller injects them per-call
- **13 guardrail tests** — sign/verify, tamper detection, policy enforcement, temporal expiry
- **ESM + CJS builds** — works in Node.js, edge runtimes, and bundlers

---

## Payment rails

| Rail | Status | Notes |
|---|---|---|
| `airwallex` | **Live sandbox** | OAuth2 client-credentials + `/transfers/create`. Real transfers verified — see [DEMO_RECEIPTS.md](DEMO_RECEIPTS.md) |
| `wise` | Stub | Wise Business API |
| `stripe` | Stub | Stripe PaymentIntents |
| `usdc-base` | Stub | Coinbase CDP / viem on Base |
| `x402` | Stub | HTTP 402 micropayment protocol |

---

## Architecture

```
operator (extension)
  └─ createEnvelope() + signEnvelope()   ← envelope.ts
       │
       ▼
  SignedEnvelope (passed to agent)
       │
       ▼
  executeAgentPayment()                  ← index.ts
    ├─ verifyEnvelope()                  ← ML-DSA-65 verify (FIPS 204)
    ├─ allowlist check
    ├─ amount ceiling check
    └─ routePayment()                    ← rails/index.ts
         └─ airwallex / wise / stripe / usdc-base / x402
```

---

## Arbitrum on-chain audit (optional)

```typescript
import { keccak_256 } from '@noble/hashes/sha3.js'
import { commitEnvelopeToArbitrum } from '@pqsafe/agent-pay'

const onchain = await commitEnvelopeToArbitrum(signed, envelope, {
  rpcUrl: process.env.ARBITRUM_RPC_URL,
  contractAddress: process.env.ARBITRUM_CONTRACT_ADDRESS,
  privateKey: process.env.ARBITRUM_PRIVATE_KEY,
  chainId: 421614,  // Arbitrum Sepolia
  keccak256: (data) => keccak_256(data),
  signTx: /* inject viem signTransaction */,
})
// onchain.txHash — Arbitrum transaction hash
// onchain.envelopeId — on-chain primary key
```

See [`evm/README.md`](../evm/README.md) for Foundry deploy instructions.

---

## Run the demo

```bash
# Mock mode — no credentials needed
npm run demo

# Live Airwallex sandbox
export AIRWALLEX_CLIENT_ID=<your sandbox client id>
export AIRWALLEX_API_KEY=<your sandbox api key>
export AIRWALLEX_ENV=demo
npm run demo

# Claude multi-agent + Arbitrum demo
ANTHROPIC_API_KEY=sk-... npm run demo:claude
```

See [DEMO_RECEIPTS.md](DEMO_RECEIPTS.md) for verified sandbox transfer IDs with cryptographic provenance.

---

## Tests

```bash
npm test    # 13 guardrail tests — sign/verify, tamper detection, policy enforcement
```

---

## Security model

- **ML-DSA-65** (NIST FIPS 204) — 128-bit post-quantum security for signing
- Envelopes are replay-protected by a 128-bit random nonce
- Time-bounded by `validFrom` / `validUntil`
- Recipient allowlist is part of the signed payload — cannot be altered without invalidating the signature
- The SDK never stores keys — caller provides them per-call

---

## Part of PQSafe AgentPay

This package is the core TypeScript SDK of the PQSafe AgentPay ecosystem. Framework plugins build on top of it:

- **[`@pqsafe/mastra`](https://www.npmjs.com/package/@pqsafe/mastra)** — Mastra workflow integration
- **[`pqsafe-agent-pay`](https://pypi.org/project/pqsafe-agent-pay/)** — Python SDK (LangChain, CrewAI, AutoGen)
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

Apache-2.0 — see [LICENSE](../LICENSE)
