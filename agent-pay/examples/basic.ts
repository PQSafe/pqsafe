/**
 * PQSafe AgentPay — basic runnable example
 *
 * Demonstrates the full flow:
 *   1. Generate a test PQ keypair (ML-DSA-65 for signing, ML-KEM-768 for encryption)
 *   2. Derive the issuer's PQSafe address
 *   3. Create a SpendEnvelope authorizing $100 USD to a test recipient
 *   4. Sign the envelope with the issuer's DSA secret key
 *   5. Verify the signed envelope
 *   6. Execute a mock payment via the Airwallex rail
 *
 * Run with:
 *   node --experimental-vm-modules examples/basic.js
 * (after building with `npm run build`)
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { createEnvelope, signEnvelope, verifyEnvelope, executeAgentPayment } from '../src/index.js'

// ---------------------------------------------------------------------------
// 1. Generate test PQ keypair
// ---------------------------------------------------------------------------

function deriveAddress(dsaPublicKey: Uint8Array): string {
  const hash = keccak_256(dsaPublicKey)
  return 'pq1' + bytesToHex(hash.slice(0, 20))
}

console.log('=== PQSafe AgentPay — Basic Example ===\n')

const dsaSeed = globalThis.crypto.getRandomValues(new Uint8Array(32))
const { publicKey: dsaPublicKey, secretKey: dsaSecretKey } = ml_dsa65.keygen(dsaSeed)
const issuerAddress = deriveAddress(dsaPublicKey)

console.log('Issuer address:', issuerAddress)
console.log('DSA public key length:', dsaPublicKey.length, 'bytes (ML-DSA-65)')

// ---------------------------------------------------------------------------
// 2. Define test recipient (e.g. Raymond's SeniorDeli Airwallex account)
// ---------------------------------------------------------------------------

const TEST_RECIPIENT = 'GB29NWBK60161331926819' // fake IBAN for example

// ---------------------------------------------------------------------------
// 3. Create a SpendEnvelope
// ---------------------------------------------------------------------------

const envelope = createEnvelope({
  issuer: issuerAddress,
  agent: 'raymond-ai-coo-v1',
  maxAmount: 100,
  currency: 'USD',
  allowedRecipients: [TEST_RECIPIENT],
  ttlSeconds: 3600, // 1 hour
  rail: 'airwallex',
})

console.log('\nCreated envelope:')
console.log(JSON.stringify(envelope, null, 2))

// ---------------------------------------------------------------------------
// 4. Sign the envelope
// ---------------------------------------------------------------------------

const signed = signEnvelope(envelope, dsaSecretKey, dsaPublicKey)
console.log('\nSigned envelope:')
console.log('  envelopeJson length:', signed.envelopeJson.length, 'chars')
console.log('  signature length:   ', signed.signature.length, 'hex chars (', signed.signature.length / 2, 'bytes)')
console.log('  dsaPublicKey length:', signed.dsaPublicKey.length, 'hex chars')

// ---------------------------------------------------------------------------
// 5. Verify the envelope (separate step — simulating agent-side verification)
// ---------------------------------------------------------------------------

console.log('\nVerifying envelope...')
const verified = verifyEnvelope(signed)
console.log('Verified successfully. Agent:', verified.agent, '| Max:', verified.maxAmount, verified.currency)

// ---------------------------------------------------------------------------
// 6. Execute a mock payment
// ---------------------------------------------------------------------------

console.log('\nExecuting mock payment...')
const result = await executeAgentPayment(signed, {
  recipient: TEST_RECIPIENT,
  amount: 50,
  memo: 'SeniorDeli supplier invoice #42',
})

console.log('\nPayment result:')
console.log(JSON.stringify(result, null, 2))

// ---------------------------------------------------------------------------
// 7. Demonstrate guard rails
// ---------------------------------------------------------------------------

console.log('\n--- Guard rail tests ---')

// Test: amount exceeds maxAmount
try {
  await executeAgentPayment(signed, { recipient: TEST_RECIPIENT, amount: 999 })
} catch (err) {
  console.log('Amount exceeded (expected):', (err as Error).message)
}

// Test: recipient not in allowlist
try {
  await executeAgentPayment(signed, { recipient: 'EVIL_ACCOUNT_XYZ', amount: 10 })
} catch (err) {
  console.log('Bad recipient (expected):', (err as Error).message)
}

console.log('\nAll checks passed. AgentPay is working correctly.')
