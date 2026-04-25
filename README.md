# PQSafe AgentPay

[![npm version](https://img.shields.io/npm/v/@pqsafe/agent-pay?color=10b981&label=npm)](https://www.npmjs.com/package/@pqsafe/agent-pay)
[![PyPI version](https://img.shields.io/pypi/v/pqsafe-agent-pay?color=10b981&label=PyPI)](https://pypi.org/project/pqsafe-agent-pay/)
[![Tests](https://img.shields.io/badge/tests-13%2F13-10b981)](agent-pay/tests/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![API](https://img.shields.io/badge/API-live%20at%20api.pqsafe.xyz-10b981)](https://api.pqsafe.xyz/docs)

**Your AI agent can now pay for the tools it needs.**

PQSafe AgentPay lets a human sign a **spend envelope** — a cryptographically bound authorization that says *this agent can spend up to $X, to these recipients, for this long*. The agent presents the envelope to execute payments autonomously. No credit card sharing. No prompt injection escape. Full audit trail.

Signatures use **ML-DSA-65 (NIST FIPS 204)** — the post-quantum standard that will remain secure against quantum computers.

## The killer demo

**Claude Code paid for its own Anthropic API credits.**

```
Claude Code running autonomously: API rate limit hit. Credits depleted.
[checks envelope] Budget: $50 USD. Allowed: anthropic.com/billing. Expiry: 24h.
[calls pqsafe_pay → $20 to anthropic.com/billing]
  Transaction ID: awx_sbx_af82cb1e  ← real Airwallex sandbox transfer
Resuming task. No human approved this payment.
```

The AI agent that writes your code also manages its own budget. No credit card handover. Post-quantum authorized. On-chain audit on Arbitrum.

[Watch the live demo at demo.pqsafe.xyz](https://demo.pqsafe.xyz) | [Handbook](https://pqsafe.xyz/handbook)

### Claude Code / Claude Desktop (MCP — zero config)

```json
// ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "pqsafe": { "url": "https://mcp.pqsafe.xyz/mcp" }
  }
}
```

Then ask Claude: *"My API credits are low — top up $20 from my PQSafe envelope."*

### OpenHands / Devin / AutoGen (TypeScript SDK)

```typescript
import { executeAgentPayment } from '@pqsafe/agent-pay'

// Register as a tool in your agent framework
const pqsafePay = (recipient, amount, memo) =>
  executeAgentPayment(signedEnvelope, { recipient, amount, memo })
```

## 5-line quickstart (TypeScript)

```bash
npm i @pqsafe/agent-pay
```

```typescript
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { createEnvelope, signEnvelope, executeAgentPayment } from '@pqsafe/agent-pay'

// 1. Human: generate keypair and sign a spend envelope
const { secretKey, publicKey } = ml_dsa65.keygen()
const envelope = createEnvelope({
  issuer: 'pq1a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b',
  agent: 'my-research-agent',
  maxAmount: 200,
  currency: 'USD',
  allowedRecipients: ['GB29NWBK60161331926819'],  // Perplexity IBAN
})
const signed = signEnvelope(envelope, secretKey, publicKey)

// 2. Agent: execute payment (all checks run automatically)
const result = await executeAgentPayment(signed, {
  recipient: 'GB29NWBK60161331926819',
  amount: 199,
  memo: 'Perplexity Pro subscription',
})
console.log(result.txId)  // awx_sbx_1234567890_abc...
```

## Python quickstart

```bash
pip install pqsafe-agent-pay
```

```python
from pqsafe import generate_keypair, create_envelope, sign_envelope, pay

keypair = generate_keypair()
envelope = create_envelope(
    issuer='pq1' + 'a' * 40,
    agent='my-research-agent',
    max_amount=200.0,
    currency='USD',
    allowed_recipients=['GB29NWBK60161331926819'],
)
signed = sign_envelope(envelope, keypair)
result = pay(signed, recipient='GB29NWBK60161331926819', amount=199.0,
             memo='Perplexity Pro subscription')
print(result.tx_id)
```

## Architecture

```
Human (Chrome extension / CLI)
  └── PQSafe Wallet — ML-DSA-65 keypair
        └── signEnvelope(envelope, sk, pk)
              │
              ▼
        SignedEnvelope  (JSON + PQ signature + pubkey)
              │  passed to agent
              ▼
  AI Agent process
    └── executeAgentPayment(signed, request)
          ├── verifyEnvelope()          ML-DSA-65 signature check
          ├── allowlist check           recipient must be in envelope
          ├── amount ceiling            request.amount <= envelope.maxAmount
          ├── temporal window           now in [validFrom, validUntil]
          ├── nonce replay check        each envelope used once
          └── routePayment()
                ├── Airwallex           bank transfers (live sandbox verified)
                ├── Wise                cross-border
                ├── Stripe              card-based merchants
                ├── USDC-Base           on-chain stablecoin
                └── x402               HTTP 402 micropayment protocol
                      └── returns txId + receipt + audit record
```

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`agent-pay`](agent-pay/) | TypeScript SDK — envelopes, ML-DSA-65 signing, multi-rail execution | **Live** — 13/13 tests, real Airwallex sandbox receipts |
| [`evm`](evm/) | Arbitrum SpendEnvelope Registry — Solidity 0.8.24 on-chain audit ledger | **Ready to deploy** — 13/13 Foundry tests |
| [`api-reference`](api-reference/) | FastAPI REST API — hosted at api.pqsafe.xyz | **Deployable** — Fly.io ready |
| [`python-sdk`](python-sdk/) | Python SDK — mirrors TypeScript SDK | PyPI: `pqsafe-agent-pay` |
| [`mcp-server`](mcp-server/) | MCP server — Cloudflare Worker | Connect Claude Desktop in 3 lines |
| [`ledger`](ledger/) | Anonymized audit ledger — Cloudflare D1 | Schema + Worker ready |
| [`demo`](demo/) | Browser demo — Cloudflare Pages | Live at demo.pqsafe.xyz |
| [`extension`](extension/) | Chrome extension — PQ wallet + signing UI | v0.2 |

## Framework integrations

### LangChain

```bash
pip install langchain-pqsafe
```

```python
from langchain_pqsafe import PQSafePaymentTool
from langchain.agents import initialize_agent

tools = [PQSafePaymentTool(api_key="your-key")]
agent = initialize_agent(tools, llm, agent="zero-shot-react-description")

agent.run("Pay $199 to GB29NWBK60161331926819 for Perplexity Pro, "
          "using the signed envelope in context.")
```

### CrewAI

```bash
pip install crewai-pqsafe
```

```python
from crewai import Agent, Task, Crew
from crewai_pqsafe import PQSafePaymentTool

pay_tool = PQSafePaymentTool(api_key="your-key")
payment_agent = Agent(
    role="Payment Executor",
    goal="Autonomously pay for required SaaS tools",
    tools=[pay_tool],
)
```

### Mastra

```bash
npm i @pqsafe/mastra
```

```typescript
import { createPQSafeTools } from '@pqsafe/mastra'

const tools = createPQSafeTools({ apiKey: 'your-key' })
// Register tools with your Mastra workflow
```

### MCP (Claude Desktop, Cursor, etc.)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pqsafe": {
      "url": "https://mcp.pqsafe.xyz/mcp"
    }
  }
}
```

Restart Claude Desktop. Claude can now call `pqsafe_pay`, `pqsafe_create_envelope`, and `pqsafe_check_balance` as tools.

## Security model

Every payment goes through five sequential checks. All five must pass or the payment is blocked:

1. **ML-DSA-65 signature** — cryptographic proof the human authorized this envelope
2. **Schema validation** — envelope fields are well-formed (Zod / Pydantic)
3. **Temporal window** — `validFrom <= now <= validUntil`
4. **Recipient allowlist** — payment target is explicitly approved by the human
5. **Amount ceiling** — requested amount does not exceed `maxAmount`

Nonce tracking prevents replay attacks (each envelope used exactly once).

## Why post-quantum

Every financial institution will migrate to PQ cryptography before 2035 (NIST mandate). Classical agent-payment systems (JWKS/JWT, ECDSA) will need to be replaced. PQSafe is native ML-DSA-65 from day one — no migration cost, no retrofit.

## Quick links

| | |
|---|---|
| Live demo | [demo.pqsafe.xyz](https://demo.pqsafe.xyz) |
| REST API docs | [api.pqsafe.xyz/docs](https://api.pqsafe.xyz/docs) |
| Audit ledger | [ledger.pqsafe.xyz](https://ledger.pqsafe.xyz) |
| Handbook | [pqsafe.xyz/handbook](https://pqsafe.xyz/handbook) |
| Arbitrum Registry | [evm/README.md](evm/README.md) — on-chain audit ledger |

## Local development

```bash
cd agent-pay
npm install
npm run demo          # mock mode — no credentials needed
npm run demo:claude   # Claude Agents + Arbitrum on-chain demo
npm test              # 13 guardrail tests
```

For real Airwallex sandbox payments, see [agent-pay/DEMO_RECEIPTS.md](agent-pay/DEMO_RECEIPTS.md).

For the FastAPI server:

```bash
cd api-reference
pip install -e ".[dev]"
uvicorn app.main:app --reload
# API docs at http://localhost:8000/docs
```

## Deploy

| Component | Command |
|-----------|---------|
| REST API (Fly.io) | `bash api-reference/deploy/deploy.sh` |
| MCP server (Cloudflare) | `cd mcp-server && npm run deploy` |
| Demo (Cloudflare Pages) | `cd demo && wrangler pages deploy .` |
| Ledger (Cloudflare D1) | See `ledger/README.md` |
| Python SDK (PyPI) | `cd python-sdk && bash publish.sh` |
| LangChain plugin (PyPI) | `cd plugins/langchain-pqsafe && bash publish.sh` |
| CrewAI plugin (PyPI) | `cd plugins/crewai-pqsafe && bash publish.sh` |
| Mastra plugin (npm) | `cd plugins/mastra-pqsafe && bash publish.sh` |

## License

MIT
