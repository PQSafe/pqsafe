# @pqsafe/mastra

Post-quantum safe payments for [Mastra](https://mastra.ai) workflows, powered by [PQSafe AgentPay](https://pqsafe.xyz).

Built on `@pqsafe/agent-pay` — see [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe)

---

## Install

```bash
npm install @pqsafe/mastra
# or
pnpm add @pqsafe/mastra
```

## 5-line quick start

```ts
import { createPQSafeIntegration } from '@pqsafe/mastra'

const pqsafe = createPQSafeIntegration()
const result = await pqsafe.pay(signedEnvelope, { recipient, amount, memo })
console.log(result) // { txId, status, rail }
```

## Mastra workflow example

```ts
import { Workflow, Step } from '@mastra/core'
import { createPQSafeIntegration } from '@pqsafe/mastra'

const pqsafe = createPQSafeIntegration()

const paySupplierWorkflow = new Workflow({ name: 'pay-supplier' })
  .step(
    new Step({
      id: 'execute-payment',
      execute: async ({ context }) => {
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

// Trigger:
const run = paySupplierWorkflow.createRun()
await run.start({
  triggerData: {
    signedEnvelope: { envelopeJson: '...', signature: '...', dsaPublicKey: '...' },
    recipient: 'anthropic.com/billing',
    amount: 20,
    memo: 'Perplexity Pro — research agent auto-renewal',
  },
})
```

---

## How it works

1. A human wallet owner issues a **signed SpendEnvelope** — a post-quantum (ML-DSA-65) token constraining agent ID, max amount, allowed recipients, and validity window.
2. The Mastra workflow calls `pqsafe.pay()` inside a step with the envelope + payment details.
3. PQSafe verifies constraints server-side and routes via the optimal rail (Airwallex, Wise, Stripe, USDC/Base, or x402).
4. The step receives `{ txId, status, rail }` and can branch on the result.

---

## API

### `createPQSafeIntegration(config?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `apiUrl` | `string` | `https://api.pqsafe.xyz/v1` | PQSafe REST API base URL |
| `timeoutMs` | `number` | `30000` | Fetch timeout in milliseconds |

Returns a `PQSafeIntegration` object with a single method:

### `pqsafe.pay(signedEnvelope, request)`

| Parameter | Type | Description |
|---|---|---|
| `signedEnvelope` | `SignedEnvelope` | `{ envelopeJson, signature, dsaPublicKey }` |
| `request.recipient` | `string` | Recipient address |
| `request.amount` | `number` | Amount (envelope's currency) |
| `request.memo` | `string?` | Optional reference |

Returns `Promise<{ txId: string, status: string, rail: string }>`.

---

## Links

- Documentation: [docs.pqsafe.xyz](https://docs.pqsafe.xyz)
- Website: [pqsafe.xyz](https://pqsafe.xyz)
- GitHub: [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe)
- npm SDK: [`@pqsafe/agent-pay`](https://www.npmjs.com/package/@pqsafe/agent-pay)
