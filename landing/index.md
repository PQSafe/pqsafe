---
title: "PQSafe AgentPay — The signed permission slip for AI agents spending money"
url: https://pqsafe.xyz/
type: homepage
---

# PQSafe AgentPay

**The signed permission slip for AI agents spending money.**

Your agent is mid-task and needs Perplexity Pro. It checks its **SpendEnvelope** — a cryptographically signed budget — PQSafe routes a payment via Airwallex, the agent pays, and resumes. No human logs in. Spending cap enforced at the SDK and Airwallex API layer. Any SaaS accepting Visa is instantly PQSafe-compatible. Every authorization is signed with **ML-DSA-65** (NIST FIPS 204) — quantum-safe from day one.

> **LIVE** — open letter to [FIDO Alliance Payments TWG](/fido-pq-letter/) · post-quantum profile contribution

**Test status:** 518 SDK tests passing (221 TS · 143 Python · 141 Solidity · 13 plugin) · 5 AP2-PQ test vectors · Apache-2.0

**Arbitrum Sepolia:** [SpendEnvelopeRegistry 0x142bA5626bf8B032EB0B59052421C42595417F5d](https://sepolia.arbiscan.io/address/0x142bA5626bf8B032EB0B59052421C42595417F5d)

---

## What's live right now

| Package | Registry | Description |
|---------|----------|-------------|
| [@pqsafe/agent-pay v0.1.1](https://www.npmjs.com/package/@pqsafe/agent-pay) | npm | Core TypeScript SDK — createEnvelope, signEnvelope, verifyEnvelope, executeAgentPayment, commitToArbitrum |
| [@pqsafe/mastra v0.1.1](https://www.npmjs.com/package/@pqsafe/mastra) | npm | Mastra framework plugin |
| [@pqsafe/mcp-server v0.1.0](https://www.npmjs.com/package/@pqsafe/mcp-server) | npm | MCP server for Claude Desktop, Cursor |
| [@pqsafe/openclaw v0.1.0](https://www.npmjs.com/package/@pqsafe/openclaw) | npm | OpenClaw skill registry integration |
| [pqsafe-agent-pay](https://pypi.org/project/pqsafe-agent-pay/) | PyPI | Core Python SDK |
| [langchain-pqsafe](https://pypi.org/project/langchain-pqsafe/) | PyPI | LangChain tool integration |
| [crewai-pqsafe](https://pypi.org/project/crewai-pqsafe/) | PyPI | CrewAI integration |

**Source:** [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe) — Apache-2.0, 518 tests passing

**Live demo:** [demo.pqsafe.xyz](https://demo.pqsafe.xyz)

**Public ledger (beta):** [ledger.pqsafe.xyz](https://ledger.pqsafe.xyz) — pilot launches Jun 2026

---

## How it works

### Step 1 — Install the SDK

```bash
npm install @pqsafe/agent-pay
# or
pip install pqsafe-agent-pay
```

### Step 2 — Issue a SpendEnvelope

```js
import { createEnvelope, signEnvelope } from '@pqsafe/agent-pay'

const envelope = createEnvelope({
  agent: 'research-agent-v1',
  maxAmount: 50,
  currency: 'USD',
  allowedRecipients: ['perplexity.ai'],
  ttlSeconds: 3600,
  rail: 'airwallex',
})
const signed = signEnvelope(envelope, secretKey, publicKey)
```

### Step 3 — Authorize and pay

```js
import { executeAgentPayment } from '@pqsafe/agent-pay'

const result = await executeAgentPayment(signed, {
  recipient: 'perplexity.ai',
  amount: 20,
  memo: 'Perplexity Pro — research task',
})
console.log(result.txId)  // real Airwallex sandbox UUID
```

---

## Payment rails

| Rail | Provider | Status | Use case |
|------|----------|--------|----------|
| `airwallex` | Airwallex | Live sandbox | USD / multi-currency wire, ACH, LOCAL |
| `wise` | Wise Business | Live sandbox | IBAN / sort code / ABA, international |
| `stripe` | Stripe | Mock ready | Invoice payment, PaymentIntent, payment link |
| `usdc-base` | Coinbase CDP / Base | Mock ready | USDC on Base L2 |
| `x402` | HTTP 402 / Coinbase x402 | Mock ready | HTTP 402 micropayments |

---

## Why post-quantum?

**Classical cryptography is being deprecated.** NIST issued FIPS 204 (ML-DSA) as the standardized replacement for ECDSA/RSA signatures in August 2024. NIST IR 8547 (initial public draft) proposes deprecating 112-bit classical algorithms including ECDSA P-256 by 2030.

**The 7-year audit window is the timer.** HKMA (Cap. 615), PSD2 Article 69, MAS, and FCA all mandate 7-year retention for financial transaction records. Every payment your agent signs with ECDSA today must remain verifiable in 2033 — well inside the window quantum hardware is expected to break it.

**ML-DSA-65** (CRYSTALS-Dilithium, NIST FIPS 204, λ=192 parameter set):
- NIST Security Level 3 — equivalent to AES-192
- 1,952-byte public keys, 3,309-byte signatures
- Constant-time implementations, no floating-point arithmetic
- Implemented via [@noble/post-quantum](https://github.com/paulmillr/noble-post-quantum)

**HKMA Quantum Preparedness Index** (verified announcement, February 3, 2026) signals that post-quantum readiness has moved from research posture to regulatory expectation for Hong Kong-regulated institutions.

---

## Comparison

| Feature | PQSafe AgentPay | Stripe Agent Toolkit | Google AP2 |
|---------|----------------|---------------------|-----------|
| Spend cap enforcement | Cryptographic envelope | Per-token limit | Mandate-based |
| Signature algorithm | ML-DSA-65 (FIPS 204) | ECDSA | ECDSA |
| Post-quantum safe | Yes | No | No |
| 7-year audit-grade receipt | Signed SpendEnvelope | Stripe-hosted log | No standard |
| Multi-rail routing | Airwallex · Wise · Stripe · USDC | Stripe only | Google Pay only |
| Open source | Apache-2.0, self-host | Stripe SDK | Google Cloud required |
| Framework plugins | LangChain · CrewAI · Mastra | Stripe SDK | Vertex AI |

---

## Framework integrations

### LangChain

```bash
pip install langchain-pqsafe
```

```python
from langchain_pqsafe import PQSafePaymentTool
from langchain.agents import AgentExecutor, create_react_agent

tool = PQSafePaymentTool(signed_envelope=signed_envelope_json)
executor = AgentExecutor(agent=create_react_agent(llm, [tool]), tools=[tool])
result = executor.invoke({"input": "Renew Perplexity Pro — $20 USD"})
```

### CrewAI

```bash
pip install crewai-pqsafe
```

```python
from crewai_pqsafe import PQSafePaymentTool
from crewai import Agent, Task, Crew

finance_agent = Agent(
    role='Finance Officer',
    goal='Execute authorized payments autonomously',
    tools=[PQSafePaymentTool(signed_envelope=signed_envelope_json)],
)
Crew(agents=[finance_agent], tasks=[pay_task]).kickoff()
```

### Mastra

```bash
npm install @pqsafe/mastra
```

```js
import { createPQSafeIntegration } from '@pqsafe/mastra'
const pqsafe = createPQSafeIntegration()
const result = await pqsafe.pay(signedEnvelope, { recipient, amount, memo })
```

### MCP server (Claude Desktop, Cursor)

```json
{
  "mcpServers": {
    "pqsafe": { "url": "https://mcp.pqsafe.xyz/mcp" }
  }
}
```

Or run locally: `npx -y @pqsafe/mcp-server`

---

## Arbitrum on-chain audit

Every payment can be anchored on-chain by committing the SpendEnvelope hash to the [SpendEnvelopeRegistry](https://sepolia.arbiscan.io/address/0x142bA5626bf8B032EB0B59052421C42595417F5d) contract on Arbitrum Sepolia. Creates an immutable, publicly auditable record. ~$0.01 gas per commit, 250ms finality.

---

## Standards contributions

- [FIDO Alliance open letter](https://pqsafe.xyz/fido-pq-letter/) — proposing AP2-PQ profile for post-quantum mandate signatures (published 2026-05-02)
- [AP2-PQ Profile RFC](https://pqsafe.xyz/ap2-pq-rfc/) — full JOSE header parameter specification, donated to FIDO Alliance 2026-04-28
- [OpenClaw Skill](https://pqsafe.xyz/openclaw-skill/) — `pqsafe.pay.v1` listed in OpenClaw (367K stars, 50K+ tools, 180K devs)

---

## Legal

Legal entity: Asaptic (Hong Kong) Limited (BR 73202453, incorporated 2021-07-20). Brand: PQSafe.

Status: technical preview. Cryptography is FIPS 204 compliant (ML-DSA-65). SDK + rails are sandbox-validated; first SaaS receiver pilot launches June 2026. Not yet for production payments at scale.

Contact: [raymond@pqsafe.xyz](mailto:raymond@pqsafe.xyz)

[For AI agents → /llms.txt](https://pqsafe.xyz/llms.txt) · [Privacy](https://pqsafe.xyz/privacy/)
