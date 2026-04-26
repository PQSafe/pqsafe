/**
 * pay-anthropic-credits.ts — runnable example
 *
 * Demonstrates PQSafePaymentTool inside a LangChain agent that pays
 * for Anthropic API credits.
 *
 * Run in mock mode (no credentials needed):
 *   npx tsx examples/pay-anthropic-credits.ts
 *
 * Run with a real envelope (set PQSAFE_MOCK=false and supply keys):
 *   PQSAFE_MOCK=false npx tsx examples/pay-anthropic-credits.ts
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { createEnvelope, signEnvelope } from '@pqsafe/agent-pay'
import { PQSafePaymentTool } from '../src/index.js'

// ---------------------------------------------------------------------------
// 1. Generate a test ML-DSA-65 keypair and derive a PQSafe address
// ---------------------------------------------------------------------------

const dsaSeed = globalThis.crypto.getRandomValues(new Uint8Array(32))
const { publicKey: dsaPublicKey, secretKey: dsaSecretKey } = ml_dsa65.keygen(dsaSeed)

function deriveAddress(pubKey: Uint8Array): string {
  const hash = keccak_256(pubKey)
  return 'pq1' + bytesToHex(hash.slice(0, 20))
}

const issuerAddress = deriveAddress(dsaPublicKey)
const RECIPIENT = 'anthropic.com/billing'

console.log('=== PQSafe AgentPay — LangChain Example ===')
console.log('Issuer address:', issuerAddress)
console.log('Recipient:     ', RECIPIENT)
console.log()

// ---------------------------------------------------------------------------
// 2. Create and sign a SpendEnvelope
// ---------------------------------------------------------------------------

const envelope = createEnvelope({
  issuer: issuerAddress,
  agent: 'langchain-demo-agent-v1',
  maxAmount: 200,
  currency: 'USD',
  allowedRecipients: [RECIPIENT],
  ttlSeconds: 3600,
  rail: 'stripe',
})

const signed = signEnvelope(envelope, dsaSecretKey, dsaPublicKey)

console.log('SpendEnvelope created and signed.')
console.log('  agent:     ', envelope.agent)
console.log('  maxAmount: ', envelope.maxAmount, envelope.currency)
console.log('  validUntil:', new Date(envelope.validUntil * 1000).toISOString())
console.log()

// ---------------------------------------------------------------------------
// 3. Create the LangChain tool
// ---------------------------------------------------------------------------

const mockMode = process.env['PQSAFE_MOCK'] !== 'false' // default: mock on

const tool = new PQSafePaymentTool({
  envelope: signed,
  mockMode,
})

console.log(`Tool created. Mock mode: ${mockMode ? 'ON (no real payment)' : 'OFF (live)'}`)
console.log('Tool name:   ', tool.name)
console.log('Tool description (truncated):', tool.description.slice(0, 80) + '...')
console.log()

// ---------------------------------------------------------------------------
// 4. Call the tool directly (simulates what a LangChain agent would do)
// ---------------------------------------------------------------------------

console.log('--- Direct tool call (simulating agent execution) ---')

const input = JSON.stringify({
  amount: 49.99,
  currency: 'USD',
  recipient: RECIPIENT,
  memo: 'Claude API credits — April 2026 batch',
})

console.log('Input:', input)
console.log()

const result = await tool.invoke(input)

console.log('Result:', result)
console.log()

// ---------------------------------------------------------------------------
// 5. Guard rail: blocked recipient
// ---------------------------------------------------------------------------

console.log('--- Guard rail: blocked recipient ---')

const blockedResult = await tool.invoke(
  JSON.stringify({ amount: 10, currency: 'USD', recipient: 'evil.com/steal' }),
)
console.log('Blocked result:', blockedResult)
console.log()

// ---------------------------------------------------------------------------
// 6. Guard rail: amount exceeds envelope ceiling
// ---------------------------------------------------------------------------

console.log('--- Guard rail: amount exceeds maxAmount ---')

const overAmountResult = await tool.invoke(
  JSON.stringify({ amount: 999, currency: 'USD', recipient: RECIPIENT }),
)
console.log('Over-amount result:', overAmountResult)
console.log()

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('=== Summary ===')
console.log('PQSafePaymentTool is ready to use inside any LangChain agent.')
console.log()
console.log('To use in a ReAct agent:')
console.log('  import { createReactAgent } from "langchain/agents"')
console.log('  const agent = createReactAgent({ llm, tools: [tool] })')
console.log()
console.log('For production: set mockMode: false and provide a real signed envelope.')
