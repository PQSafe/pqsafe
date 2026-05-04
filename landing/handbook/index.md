---
title: "Agent Payments Handbook — PQSafe AgentPay"
url: https://pqsafe.xyz/handbook/
type: handbook
---

# Agent Payments Handbook

Give your AI agent a post-quantum signed spending budget. It pays autonomously. You stay in control.

**Badges:** ML-DSA-65 · NIST FIPS 204 · Airwallex + Wise live · 5 rails · 13/13 guardrail tests · Arbitrum on-chain audit

---

## Quickstart — 60 seconds

```bash
npm install @pqsafe/agent-pay
```

```typescript
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { createEnvelope, signEnvelope, executeAgentPayment } from '@pqsafe/agent-pay'

// 1. Generate post-quantum keypair (wallet side — keep secretKey private)
const { secretKey, publicKey } = ml_dsa65.keygen(crypto.getRandomValues(new Uint8Array(32)))
const issuer = 'pq1' + bytesToHex(publicKey.slice(0, 20))

// 2. Issue a signed SpendEnvelope — defines what the agent is allowed to spend
const envelope = createEnvelope({
  issuer,
  agent: 'research-agent-v1',
  maxAmount: 50,
  currency: 'USD',
  allowedRecipients: ['perplexity.ai'],
  ttlSeconds: 3600,
  rail: 'airwallex',
})

const signed = signEnvelope(envelope, secretKey, publicKey)

// 3. Agent calls this — verifies PQ sig + enforces all limits before paying
const result = await executeAgentPayment(signed, {
  recipient: 'perplexity.ai',
  amount: 20,
  memo: 'Perplexity Pro — research task',
})

console.log(result.txId)  // real Airwallex sandbox UUID
```

---

## The SpendEnvelope concept

A `SpendEnvelope` is a signed JSON token that encodes exactly what an AI agent is authorized to spend. It is the authorization — no centralized server, no API key delegation, no human-in-the-loop approval per payment.

| Field | Description |
|-------|-------------|
| `version` | Must be `1` |
| `issuer` | PQSafe wallet address of the human owner (`pq1…`) |
| `agent` | Identifier string for the AI agent (`"research-agent-v1"`) |
| `maxAmount` | Maximum spend ceiling — SDK rejects anything above this |
| `currency` | ISO 4217 code: `USD`, `HKD`, `EUR`… |
| `allowedRecipients` | Allowlist — agent cannot pay anyone not on this list |
| `validFrom / validUntil` | Unix timestamps — time-bounded authorization window |
| `nonce` | 128-bit random hex — prevents replay attacks |
| `rail` | Optional: `airwallex` \| `wise` \| `stripe` \| `usdc-base` \| `x402` |

The entire envelope is signed with **ML-DSA-65** (NIST FIPS 204 lattice-based signature, 128-bit post-quantum security). The signature covers all fields deterministically — any field alteration invalidates the signature.

---

## Installation

TypeScript / Node.js SDK (ES2022, ESM, Node 18+):

```bash
npm install @pqsafe/agent-pay @noble/post-quantum @noble/hashes
```

Python SDK (Python 3.10+):

```bash
pip install pqsafe-agent-pay
```

Source at [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe) — MIT license.

---

## Create and sign an envelope

```typescript
import { createEnvelope, signEnvelope } from '@pqsafe/agent-pay'

const envelope = createEnvelope({
  issuer,               // 'pq1' + 40 hex chars
  agent: 'my-agent-v1',
  maxAmount: 100,
  currency: 'USD',
  allowedRecipients: ['anthropic.com/billing', 'openai.com'],
  startsInSeconds: 0,   // valid immediately (default)
  ttlSeconds: 3600,     // valid for 1 hour (default)
  rail: 'airwallex',
})

const signed = signEnvelope(envelope, secretKey, publicKey)
// → { envelopeJson, signature, dsaPublicKey }
```

The `signed` object is safe to hand to the agent process — it contains only the envelope JSON, signature, and public key. The secret key never needs to leave the wallet.

---

## Verify and execute payment (agent side)

```typescript
import { executeAgentPayment } from '@pqsafe/agent-pay'

const result = await executeAgentPayment(signed, {
  recipient: 'anthropic.com/billing',   // must be in allowedRecipients
  amount: 20,                           // must be ≤ maxAmount
  memo: 'Anthropic API credits — Oct 2026',
})

console.log(result.txId)       // Airwallex transfer UUID
console.log(result.success)    // true
console.log(result.executedAt) // ISO 8601
```

`executeAgentPayment` runs all checks internally — signature verification, schema validation, temporal validity, allowlist, amount ceiling — then routes to the configured rail. It throws on any violation before attempting any network call to the payment provider.

---

## Guardrails enforced

| Check | What it prevents |
|-------|-----------------|
| `ML-DSA-65 signature` | Forged envelopes, tampered fields, wrong signer |
| `Schema validation` | Malformed or incomplete envelopes |
| `validFrom check` | Pre-activated envelopes used too early |
| `validUntil check` | Expired envelopes reused after TTL |
| `allowedRecipients` | Payments to unauthorized addresses |
| `maxAmount ceiling` | Over-spend attacks by a compromised agent |
| `nonce (128-bit)` | Replay attacks — nonce is part of the signed payload |

All 13 guardrail tests run on every commit. See [tests/envelope.test.ts](https://github.com/PQSafe/pqsafe/blob/main/agent-pay/tests/envelope.test.ts).

---

## Payment rails

| Rail key | Provider | Status | Use case |
|----------|----------|--------|----------|
| `airwallex` | Airwallex | Live sandbox | USD / multi-currency wire, ACH, LOCAL |
| `stripe` | Stripe | Mock ready | Invoice payment (`in_xxx`), PaymentIntent confirm (`pi_xxx`), payment link |
| `wise` | Wise Business | Live sandbox | IBAN / sort code / ABA — mid-market rate, international |
| `usdc-base` | Coinbase CDP / Base | Mock ready | USDC on Base L2 — inject viem/ethers/CDP AgentKit signer |
| `x402` | HTTP 402 / Coinbase x402 | Mock ready | HTTP 402 micropayments — probe endpoint, validate requirements, pay |

---

## Configuration

Set via environment variables or `setAgentPayConfig()`:

```bash
# Airwallex sandbox (demo)
AIRWALLEX_CLIENT_ID=your_client_id
AIRWALLEX_API_KEY=your_api_key
AIRWALLEX_ENV=demo         # 'demo' for sandbox, 'production' for live

# Mock mode — no real API calls (default when creds absent)
PQSAFE_MOCK_MODE=1
```

### Wise rail

```bash
WISE_API_KEY=your_wise_api_key
WISE_ENV=sandbox         # 'live' for production
```

Wise auto-detects recipient format: IBAN (`GB29NWBK…`), UK sort code (`60-00-01/12345678`), or US ABA (`021000021/12345678`).

### Telegram approval gate

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789
PQSAFE_APPROVAL_THRESHOLD=100    # USD — above this, require human approval
PQSAFE_APPROVAL_TIMEOUT_S=300    # seconds to wait before auto-reject
```

```typescript
import { executeWithApproval } from '@pqsafe/agent-pay'

// Payments ≤ $100 → autonomous. Payments > $100 → Telegram [APPROVE][REJECT]
const result = await executeWithApproval(signed, {
  recipient: 'vendor@company.com',
  amount: 150,
  memo: 'Q2 supplier invoice',
}, { autoApproveThreshold: 100 })
```

### USDC-Base rail

```bash
BASE_NETWORK=sepolia         # 'mainnet' for production
```

```typescript
import { executeAgentPayment } from '@pqsafe/agent-pay'
import { createWalletClient, http } from 'viem'
import { base } from 'viem/chains'

const walletClient = createWalletClient({ account, chain: base, transport: http() })

const envelope = createEnvelope({
  agent: 'my-agent',
  maxAmount: 500,
  currency: 'USDC',
  allowedRecipients: ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'],
  rail: 'usdc-base',
})
const signed = signEnvelope(envelope, secretKey, publicKey)

const result = await executeAgentPayment(signed, {
  recipient: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  amount: 100,
  memo: 'USDC payment via Base',
}, {
  usdcBase: {
    network: 'mainnet',
    signAndSend: async ({ to, data }) => walletClient.sendTransaction({ to, data }),
  }
})
```

USDC contract addresses: mainnet `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

---

## LangChain integration

```bash
pip install langchain-pqsafe
```

```python
from langchain_pqsafe import PQSafePaymentTool
from langchain.agents import AgentExecutor, create_react_agent

tool = PQSafePaymentTool(signed_envelope=signed_envelope_json)
executor = AgentExecutor(agent=create_react_agent(llm, [tool]), tools=[tool])

result = executor.invoke({
    "input": "Renew Perplexity Pro at perplexity.ai — $20 USD for research-agent-v1"
})
```

Full guide: [plugins/langchain-pqsafe](https://github.com/PQSafe/pqsafe/tree/main/plugins/langchain-pqsafe)

---

## CrewAI integration

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

pay_task = Task(
    description='Renew Perplexity Pro subscription at perplexity.ai — $20 USD.',
    agent=finance_agent,
    expected_output='Payment confirmation with txId and rail',
)

Crew(agents=[finance_agent], tasks=[pay_task]).kickoff()
```

Full guide: [plugins/crewai-pqsafe](https://github.com/PQSafe/pqsafe/tree/main/plugins/crewai-pqsafe)

---

## Mastra integration

```bash
npm install @pqsafe/mastra
```

```typescript
import { createPQSafeIntegration } from '@pqsafe/mastra'

const pqsafe = createPQSafeIntegration()

const result = await pqsafe.pay(signedEnvelope, {
  recipient: 'anthropic.com/billing',
  amount: 20,
  memo: 'Perplexity Pro — research agent auto-renewal',
})
```

Full guide: [plugins/mastra-pqsafe](https://github.com/PQSafe/pqsafe/tree/main/plugins/mastra-pqsafe)

---

## MCP server — Claude Code, Claude Desktop, Cursor

The PQSafe MCP server exposes payment tools to any MCP-compatible AI agent.

### Connect to Claude Desktop / Claude Code

```json
// ~/.claude/claude_desktop_config.json  (or Claude Code settings)
{
  "mcpServers": {
    "pqsafe": {
      "url": "https://mcp.pqsafe.xyz/mcp"
    }
  }
}
```

Claude has 4 payment tools once connected:

| Tool | What it does |
|------|-------------|
| `pqsafe_create_envelope` | Build a SpendEnvelope (unsigned — operator must sign) |
| `pqsafe_pay` | Verify + execute payment via Airwallex |
| `pqsafe_check_balance` | Read envelope constraints without paying |
| `pqsafe_commit_onchain` | Return on-chain commit IDs for Arbitrum registry |

**Self-hosted:** Run `npm run build` in `mcp-server/` and deploy as a Cloudflare Worker with your `AIRWALLEX_CLIENT_ID` and `AIRWALLEX_API_KEY` env vars. Source: [mcp-server/](https://github.com/PQSafe/pqsafe/tree/main/mcp-server)

---

## Arbitrum on-chain audit layer

Every PQSafe payment can be anchored on-chain by committing the SpendEnvelope hash + ML-DSA-65 signature fingerprint to the SpendEnvelopeRegistry contract on Arbitrum Sepolia.

**Contract:** [0x142bA5626bf8B032EB0B59052421C42595417F5d](https://sepolia.arbiscan.io/address/0x142bA5626bf8B032EB0B59052421C42595417F5d)

### Deploy the registry

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

cd evm && forge install foundry-rs/forge-std && forge build
forge test -vv

export PRIVATE_KEY=0x...
export ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast --verify
```

### Contract interface

| Function | Who calls | Purpose |
|----------|-----------|---------|
| `commit(envelopeId, sigFingerprint, agent, maxAmount, currency, validUntil, nonce)` | Operator | Pre-authorize a payment on-chain |
| `markUsed(envelopeId, txReference, amountUsed)` | Operator | Record Airwallex txId + actual amount after payment executes |
| `isCommitted(envelopeId)` | Anyone | Check if payment was pre-authorized |
| `getRecord(envelopeId)` | Anyone | Full audit record including operator, cap, currency, sig fingerprint |

~$0.01 gas per `commit()`. 250ms finality. EVM-equivalent.

---

## Public audit ledger

After each successful payment, the SDK can optionally submit an anonymized record to [ledger.pqsafe.xyz](https://ledger.pqsafe.xyz). Opt-in via environment variables. No PII, no exact amounts, no recipient addresses.

```bash
PQSAFE_LEDGER_URL=https://ledger.pqsafe.xyz
PQSAFE_LEDGER_API_KEY=your-ledger-api-key
```

| Field | Value | Reversible? |
|-------|-------|-------------|
| envelopeHash | SHA-256 of signed envelope bytes | No |
| agentIdHash | SHA-256 of agent identifier string | No |
| rail | e.g. `airwallex`, `wise` | — |
| amountBucket | One of: <10, 10-100, 100-1000, 1000-10000, >10000 | — |
| currency | ISO code (e.g. `USD`, `USDC`) | — |
| outcome | `success` or `failed` | — |
| timestamp | Unix seconds | — |

---

## Security model

**Post-quantum signature.** ML-DSA-65 (NIST FIPS 204, Module Lattice Digital Signature Algorithm). 128-bit security against classical and quantum adversaries. Public key 1,952 bytes, signature 3,309 bytes. Implemented via [@noble/post-quantum](https://github.com/paulmillr/noble-post-quantum).

**No key custody.** The SDK never holds or stores signing keys. The secret key is provided per-call by the wallet layer and used only during `signEnvelope()`.

**Deterministic serialization.** Envelope JSON is serialized with sorted keys before signing, ensuring identical bytes across platforms and preventing signature bypass via key reordering.

**Replay prevention.** The 128-bit random nonce is committed into the signed envelope.

**Defense-in-depth.** Even if an agent process is fully compromised, it cannot spend beyond `maxAmount`, pay a recipient not in `allowedRecipients`, or use an expired envelope — all enforced by the SDK before any rail call.

---

## API reference

### `createEnvelope(params): SpendEnvelope`

Build a new unsigned SpendEnvelope. Nonce is auto-generated with `crypto.getRandomValues`.

| Param | Type | Description |
|-------|------|-------------|
| `issuer` | string | PQSafe address (`pq1…`) |
| `agent` | string | Agent identifier, 1–128 chars |
| `maxAmount` | number | Spend ceiling (positive) |
| `currency` | string | ISO 4217, e.g. `USD` |
| `allowedRecipients` | string[] | Non-empty allowlist |
| `ttlSeconds?` | number | Default 3600 |
| `startsInSeconds?` | number | Default 0 (immediate) |
| `rail?` | Rail | Optional rail constraint |

### `signEnvelope(envelope, secretKey, publicKey): SignedEnvelope`

Sign with issuer's ML-DSA-65 secret key. Returns `{ envelopeJson, signature, dsaPublicKey }` — safe to pass to agent.

### `verifyEnvelope(signed, dsaPublicKey?): SpendEnvelope`

Verify signature + schema + temporal validity. Throws on any failure. Returns parsed envelope.

### `executeAgentPayment(signed, request): Promise<PaymentResult>`

Full pipeline: verify → allowlist → amount ceiling → route to rail.

| Request field | Type | Required |
|--------------|------|----------|
| `recipient` | string | Yes — must be in allowedRecipients |
| `amount` | number | Yes — must be >0 and ≤maxAmount |
| `memo?` | string | No |

---

Something missing? [Open a GitHub issue](https://github.com/PQSafe/pqsafe/issues) — fixed same day.
