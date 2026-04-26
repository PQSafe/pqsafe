/**
 * supplier-payment-workflow.ts — Mastra workflow example using PQSafe AgentPay.
 *
 * Demonstrates a 3-step workflow:
 *   1. Validate invoice (business logic)
 *   2. Execute payment via PQSafe (mock mode)
 *   3. Log the audit record
 *
 * Run:
 *   npx tsx examples/supplier-payment-workflow.ts
 *
 * Note: This example runs without Mastra's runtime to keep it self-contained.
 * For actual Mastra integration, wrap the steps inside Mastra Workflow + Step objects.
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { createEnvelope, signEnvelope } from '@pqsafe/agent-pay'
import { createPQSafeIntegration, pqsafeToolConfig } from '../src/index.js'

// ---------------------------------------------------------------------------
// Setup: generate keypair and create a test SpendEnvelope
// ---------------------------------------------------------------------------

const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
const { publicKey, secretKey } = ml_dsa65.keygen(seed)

function deriveAddress(pk: Uint8Array): string {
  return 'pq1' + bytesToHex(keccak_256(pk).slice(0, 20))
}

const issuer = deriveAddress(publicKey)
const SUPPLIER_IBAN = 'GB29NWBK60161331926819' // SeniorDeli test supplier

const envelope = createEnvelope({
  issuer,
  agent: 'mastra-procurement-workflow-v1',
  maxAmount: 2000,
  currency: 'HKD',
  allowedRecipients: [SUPPLIER_IBAN],
  ttlSeconds: 3600,
  rail: 'airwallex',
})

const signed = signEnvelope(envelope, secretKey, publicKey)

// ---------------------------------------------------------------------------
// Workflow context (simulates what Mastra passes between steps)
// ---------------------------------------------------------------------------

interface WorkflowContext {
  invoice: {
    supplier: string
    amount: number
    currency: string
    memo: string
  }
  signedEnvelope: typeof signed
  paymentResult?: {
    success: boolean
    txId: string
    rail: string
    amount: number
    currency: string
  }
  auditLog: string[]
}

const ctx: WorkflowContext = {
  invoice: {
    supplier: SUPPLIER_IBAN,
    amount: 1500,
    currency: 'HKD',
    memo: 'SeniorDeli supplier invoice #88 — frozen dim sum delivery',
  },
  signedEnvelope: signed,
  auditLog: [],
}

console.log('=== PQSafe AgentPay — Mastra Workflow Example ===')
console.log()

// ---------------------------------------------------------------------------
// Step 1: Validate invoice
// ---------------------------------------------------------------------------

console.log('[Step 1] Validate invoice...')

function validateInvoice(context: WorkflowContext): boolean {
  const { invoice } = context
  if (invoice.amount <= 0) {
    throw new Error('Invoice amount must be positive')
  }
  if (!invoice.supplier) {
    throw new Error('Invoice must have a supplier')
  }
  console.log(`  Invoice valid: ${invoice.amount} ${invoice.currency} to ${invoice.supplier}`)
  context.auditLog.push(`[${new Date().toISOString()}] Invoice validated: ${invoice.memo}`)
  return true
}

validateInvoice(ctx)
console.log()

// ---------------------------------------------------------------------------
// Step 2: Execute payment (mock mode)
// ---------------------------------------------------------------------------

console.log('[Step 2] Execute payment (mock mode)...')

const pqsafe = createPQSafeIntegration({ mockMode: true })

const payResult = await pqsafe.pay(ctx.signedEnvelope, {
  recipient: ctx.invoice.supplier,
  amount: ctx.invoice.amount,
  memo: ctx.invoice.memo,
})

ctx.paymentResult = payResult
ctx.auditLog.push(
  `[${new Date().toISOString()}] Payment: txId=${payResult.txId} rail=${payResult.rail} ` +
  `amount=${payResult.amount} ${payResult.currency}`,
)

console.log('  Result:', JSON.stringify(payResult, null, 2).replace(/\n/g, '\n  '))
console.log()

// ---------------------------------------------------------------------------
// Step 3: Audit log
// ---------------------------------------------------------------------------

console.log('[Step 3] Audit log...')
ctx.auditLog.push(`[${new Date().toISOString()}] Workflow complete. Success: ${payResult.success}`)

for (const entry of ctx.auditLog) {
  console.log(' ', entry)
}
console.log()

// ---------------------------------------------------------------------------
// Alternative: use the Mastra Tool object directly
// ---------------------------------------------------------------------------

console.log('[Alternative] Using pqsafeToolConfig.execute() directly (Mastra Tool interface)...')

const toolResult = await pqsafeToolConfig.execute({
  envelopeJson: signed.envelopeJson,
  signature: signed.signature,
  dsaPublicKey: signed.dsaPublicKey,
  recipient: SUPPLIER_IBAN,
  amount: 800,
  memo: 'Partial payment — first instalment',
  mockMode: true,
})

console.log('  Tool result:', JSON.stringify(toolResult, null, 2).replace(/\n/g, '\n  '))
console.log()

console.log('=== Workflow complete ===')
console.log()
console.log('To use with actual Mastra:')
console.log('  import { createTool } from "@mastra/core"')
console.log('  import { pqsafeToolConfig } from "@pqsafe/mastra"')
console.log('  const pqsafeTool = createTool(pqsafeToolConfig)')
