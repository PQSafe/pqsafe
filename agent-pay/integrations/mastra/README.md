# @pqsafe/mastra

> **Experimental** — Mastra's Tool interface is evolving. This integration tracks `@mastra/core >= 0.1.0`.

Mastra integration for [PQSafe AgentPay](https://pqsafe.xyz) — post-quantum safe payments for Mastra workflows.

[![npm version](https://img.shields.io/npm/v/@pqsafe/mastra.svg)](https://www.npmjs.com/package/@pqsafe/mastra)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Install

```bash
npm install @pqsafe/mastra @mastra/core
```

## Usage

### With Mastra's createTool

```typescript
import { createTool } from '@mastra/core'
import { pqsafeToolConfig } from '@pqsafe/mastra'

const pqsafeTool = createTool(pqsafeToolConfig)
```

### As a workflow step integration

```typescript
import { createPQSafeIntegration } from '@pqsafe/mastra'

const pqsafe = createPQSafeIntegration({ mockMode: true })

// Inside any Mastra workflow step:
const result = await pqsafe.pay(context.signedEnvelope, {
  recipient: 'GB29NWBK60161331926819',
  amount: 1500,
  memo: 'SeniorDeli invoice #88',
})
```

## Mock mode

```typescript
const pqsafe = createPQSafeIntegration({ mockMode: true })
// No credentials needed — returns synthetic txId
```

Run the example:

```bash
npx tsx examples/supplier-payment-workflow.ts
```

## Tool input / output

Input:
- `envelopeJson` — canonical envelope JSON string
- `signature` — ML-DSA-65 signature (hex)
- `dsaPublicKey` — issuer public key (hex)
- `recipient` — rail-specific recipient address
- `amount` — payment amount
- `memo` (optional) — human-readable reference
- `mockMode` (optional) — bypass rail, return synthetic result

Output:
- `success`, `txId`, `rail`, `amount`, `currency`, `recipient`, `executedAt`
- `error` (if failed)

## Related

- [`@pqsafe/agent-pay`](../../README.md) — core SDK
- [`@pqsafe/agent-pay-langchain`](../langchain/) — LangChain integration
- [`crewai-pqsafe`](../crewai/) — CrewAI integration
- [`@pqsafe/mcp-server`](../mcp/) — MCP server
