/**
 * workflow.ts — Mastra workflow example using PQSafe AgentPay.
 *
 * Prerequisites:
 *   npm install @pqsafe/mastra @mastra/core
 *
 * Run (after building):
 *   node dist/examples/workflow.js
 *
 * Note: @mastra/core workflow API shown here reflects the 0.x API.
 * Adjust Step/Workflow imports to match your installed version.
 */

import { createPQSafeIntegration, SignedEnvelope } from '../src/index.js'

// ---------------------------------------------------------------------------
// Stub envelope — replace with a real one from PQSafe CLI / SDK
// ---------------------------------------------------------------------------
const STUB_ENVELOPE: SignedEnvelope = {
  envelopeJson: JSON.stringify({
    version: 1,
    issuer: 'pq1' + 'a'.repeat(40),
    agent: 'mastra-demo-workflow',
    maxAmount: 500,
    currency: 'USD',
    allowedRecipients: ['GB29NWBK60161331926819'],
    validFrom: 1700000000,
    validUntil: 9999999999,
    nonce: 'a'.repeat(32),
  }),
  signature: '00'.repeat(100),   // placeholder — real signature required for live payments
  dsaPublicKey: 'ff'.repeat(32), // placeholder
}

// ---------------------------------------------------------------------------
// Integration setup
// ---------------------------------------------------------------------------
const pqsafe = createPQSafeIntegration({
  // For local testing you could point at a mock server:
  // apiUrl: 'http://localhost:3000/v1',
})

// ---------------------------------------------------------------------------
// Standalone demo (no Mastra runtime needed for this example)
// ---------------------------------------------------------------------------
async function runStandaloneDemo(): Promise<void> {
  console.log('PQSafe Mastra integration — standalone demo')
  console.log('Calling pqsafe.pay() ...')

  try {
    const result = await pqsafe.pay(STUB_ENVELOPE, {
      recipient: 'GB29NWBK60161331926819',
      amount: 150,
      memo: 'Supplier invoice #42',
    })
    console.log('Payment result:', result)
  } catch (err) {
    // Expected in stub mode — API endpoint is not live yet
    console.error('Payment error (expected in stub mode):', (err as Error).message)
  }
}

// ---------------------------------------------------------------------------
// Mastra workflow definition (import Workflow/Step from @mastra/core at runtime)
// ---------------------------------------------------------------------------
export function buildPaySupplierWorkflow(mastraCore: {
  Workflow: new (opts: { name: string }) => { step: (s: unknown) => unknown; commit: () => unknown }
  Step: new (opts: { id: string; execute: (ctx: { context: { triggerData: Record<string, unknown> } }) => Promise<unknown> }) => unknown
}) {
  const { Workflow, Step } = mastraCore

  const payStep = new Step({
    id: 'execute-payment',
    execute: async ({ context }) => {
      const data = context.triggerData as {
        signedEnvelope: SignedEnvelope
        recipient: string
        amount: number
        memo?: string
      }
      return pqsafe.pay(data.signedEnvelope, {
        recipient: data.recipient,
        amount: data.amount,
        memo: data.memo,
      })
    },
  })

  return new Workflow({ name: 'pay-supplier' })
    .step(payStep)
    // @ts-expect-error: commit() signature varies by @mastra/core version
    .commit()
}

// Run standalone demo when executed directly
runStandaloneDemo()
