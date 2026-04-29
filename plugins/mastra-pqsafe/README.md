# @pqsafe/mastra

[![npm](https://img.shields.io/npm/v/@pqsafe/mastra)](https://www.npmjs.com/package/@pqsafe/mastra)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**Post-quantum signed payments for [Mastra](https://mastra.ai) workflows — drop one step into your workflow and every payment is FIPS 204 enforced.**

Part of the [PQSafe AgentPay](https://github.com/PQSafe/pqsafe) ecosystem. Built on [`@pqsafe/agent-pay`](https://www.npmjs.com/package/@pqsafe/agent-pay).

---

## What it does

`@pqsafe/mastra` wraps PQSafe AgentPay as a Mastra-native integration. A Mastra workflow step calls `pqsafe.pay()` with a signed SpendEnvelope — a post-quantum (ML-DSA-65) token issued by the human wallet owner — and PQSafe enforces the policy constraints before routing the payment across the configured rail.

Your Mastra workflows get cryptographically-scoped, time-bounded, quantum-resistant payment authorization with no long-lived API keys or plaintext credentials in the workflow definition. The envelope travels with the workflow trigger and is self-verifying.

---

## Install

```bash
npm install @pqsafe/mastra
# or
pnpm add @pqsafe/mastra
```

---

## Quickstart

```typescript
import { createPQSafeIntegration } from '@pqsafe/mastra'

const pqsafe = createPQSafeIntegration()

// Inside any Mastra step or action:
const result = await pqsafe.pay(signedEnvelope, {
  recipient: 'supplier.example.com/billing',
  amount: 150,
  memo: 'Invoice #42',
})

console.log(result.txId)    // e.g. "airwallex-tx-abc123"
console.log(result.status)  // "success"
console.log(result.rail)    // "airwallex"
```

---

## Mastra workflow example

```typescript
import { Workflow, Step } from '@mastra/core'
import { createPQSafeIntegration } from '@pqsafe/mastra'

const pqsafe = createPQSafeIntegration()

const paySupplierWorkflow = new Workflow({ name: 'pay-supplier' })
  .step(
    new Step({
      id: 'execute-payment',
      execute: async ({ context }) => {
        // signedEnvelope comes from the workflow trigger — issued by the wallet owner
        const result = await pqsafe.pay(context.triggerData.signedEnvelope, {
          recipient: context.triggerData.recipient,
          amount: context.triggerData.amount,
          memo: context.triggerData.memo,
        })
        return {
          txId: result.txId,
          status: result.status,
          rail: result.rail,
        }
      },
    }),
  )
  .commit()

// Trigger the workflow
const run = paySupplierWorkflow.createRun()
await run.start({
  triggerData: {
    signedEnvelope: {
      envelopeJson: '{"version":1,"issuer":"pq1...","agent":"supplier-bot-v1",...}',
      signature: 'deadbeef...',
      dsaPublicKey: 'cafebabe...',
    },
    recipient: 'supplier.example.com/billing',
    amount: 150,
    memo: 'Invoice #42',
  },
})
```

---

## How it works

1. A human wallet owner issues a **signed SpendEnvelope** using `@pqsafe/agent-pay` (or the PQSafe wallet extension). The envelope encodes: agent ID, max amount, allowed recipients, currency, and validity window — all bound by an ML-DSA-65 signature.
2. The envelope is passed as workflow trigger data — it travels with the job, not stored in the workflow definition.
3. Inside a Mastra step, `pqsafe.pay()` verifies the post-quantum signature server-side, enforces all policy constraints, and routes the payment to the cheapest available rail (Airwallex, Wise, Stripe, USDC/Base, or x402).
4. The step receives `{ txId, status, rail }` and can branch on the result or pass it downstream.

---

## What you get

- **Zero config for most workflows** — `createPQSafeIntegration()` with no arguments connects to `https://api.pqsafe.xyz/v1`
- **FIPS 204 ML-DSA-65 enforcement** — PQSafe rejects any payment that violates the signed envelope policy
- **Multi-rail routing** — Airwallex (live sandbox), Wise, Stripe, USDC on Base, x402
- **Mastra-native** — returns structured data that Mastra workflows can branch on
- **ESM + CJS builds** — works in Node.js, edge runtimes, and bundlers
- **No long-lived credentials in workflow code** — only the short-lived signed envelope is needed at runtime

---

## API

### `createPQSafeIntegration(config?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `apiUrl` | `string` | `https://api.pqsafe.xyz/v1` | PQSafe REST API base URL |
| `timeoutMs` | `number` | `30000` | Fetch timeout in milliseconds |

Returns a `PQSafeIntegration` object.

### `pqsafe.pay(signedEnvelope, request)`

| Parameter | Type | Description |
|---|---|---|
| `signedEnvelope` | `SignedEnvelope` | `{ envelopeJson, signature, dsaPublicKey }` — issued by the wallet owner |
| `request.recipient` | `string` | Recipient address (IBAN, crypto addr, domain, etc.) |
| `request.amount` | `number` | Amount in the envelope's currency |
| `request.memo` | `string?` | Optional human-readable reference |

Returns `Promise<{ txId: string, status: string, rail: string }>`.

---

## Part of PQSafe AgentPay

- **[`@pqsafe/agent-pay`](https://www.npmjs.com/package/@pqsafe/agent-pay)** — core TypeScript SDK (envelope creation, signing, verification)
- **[`pqsafe-agent-pay`](https://pypi.org/project/pqsafe-agent-pay/)** — Python SDK
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

Apache-2.0 — see [LICENSE](../../LICENSE)
