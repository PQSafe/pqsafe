# @pqsafe/agent-pay-langchain

LangChain integration for [PQSafe AgentPay](https://pqsafe.xyz) — post-quantum safe payments for AI agents.

[![npm version](https://img.shields.io/npm/v/@pqsafe/agent-pay-langchain.svg)](https://www.npmjs.com/package/@pqsafe/agent-pay-langchain)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What it does

`PQSafePaymentTool` extends LangChain's `Tool` class. Drop it into any LangChain agent and it gains the ability to execute payments bounded by a **PQ-signed SpendEnvelope** — an ML-DSA-65 authorization token that enforces recipient allowlist, amount ceiling, currency, and validity window.

No centralized API key. The envelope IS the authorization.

## Install

```bash
npm install @pqsafe/agent-pay-langchain @langchain/core
```

## Usage

```typescript
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { createEnvelope, signEnvelope } from '@pqsafe/agent-pay'
import { PQSafePaymentTool } from '@pqsafe/agent-pay-langchain'

// 1. Issue a SpendEnvelope from the wallet owner's keypair
const { publicKey, secretKey } = ml_dsa65.keygen()
const envelope = createEnvelope({
  issuer: 'pq1a1b2c3d...',
  agent: 'my-langchain-agent',
  maxAmount: 200,
  currency: 'USD',
  allowedRecipients: ['anthropic.com/billing'],
  ttlSeconds: 3600,
})
const signed = signEnvelope(envelope, secretKey, publicKey)

// 2. Create the tool
const tool = new PQSafePaymentTool({ envelope: signed })

// 3. Use inside any LangChain agent
import { createReactAgent } from 'langchain/agents'
const agent = createReactAgent({ llm, tools: [tool] })
```

## Mock mode

Run examples with no credentials:

```typescript
const tool = new PQSafePaymentTool({
  envelope: signed,
  mockMode: true,  // returns synthetic txId, skips real rail
})
```

Run the example script:

```bash
npx tsx examples/pay-anthropic-credits.ts
# PQSAFE_MOCK=false npx tsx examples/pay-anthropic-credits.ts  (live)
```

## Tool input format

The agent passes a JSON string to `pqsafe_pay`:

```json
{
  "amount": 49.99,
  "currency": "USD",
  "recipient": "anthropic.com/billing",
  "memo": "Claude API credits — April 2026"
}
```

## Tool output

```
Payment successful. txId=airwallex_txn_abc123 rail=stripe amount=49.99 USD recipient=anthropic.com/billing executedAt=2026-04-26T10:00:00.000Z
```

## Production rail setup

Set the `rail` config when creating the tool:

```typescript
import type { RailConfig } from '@pqsafe/agent-pay'

const railConfig: RailConfig = {
  type: 'airwallex',
  clientId: process.env.AIRWALLEX_CLIENT_ID!,
  apiKey: process.env.AIRWALLEX_API_KEY!,
}

const tool = new PQSafePaymentTool({ envelope: signed, rail: railConfig })
```

Supported rails: `airwallex` | `wise` | `stripe` | `usdc-base` | `x402`

## Guard rails

All constraints are enforced by the SDK before any payment is attempted:

| Check | Behaviour on failure |
|---|---|
| ML-DSA-65 signature | Tool returns `Payment failed: ...` string |
| Recipient not in allowlist | Tool returns error string (no payment) |
| Amount > maxAmount | Tool returns error string (no payment) |
| Envelope expired | Tool returns error string (no payment) |
| Currency mismatch | Tool returns error string (no payment) |

## Related

- [`@pqsafe/agent-pay`](../../README.md) — core SDK
- [`@pqsafe/mcp-server`](../mcp/) — MCP server for Claude Desktop / Cursor
- [`crewai-pqsafe`](../crewai/) — CrewAI integration
