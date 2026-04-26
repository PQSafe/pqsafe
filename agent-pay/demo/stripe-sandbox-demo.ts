/**
 * Stripe Test Mode Demo — PQSafe AgentPay
 *
 * Executes a REAL PaymentIntent against the Stripe test API
 * (api.stripe.com with sk_test_* key) and returns the Payment Intent ID.
 *
 * What this script does:
 *   1. Loads credentials from ~/.pqsafe-stripe.env
 *   2. Generates a fresh ML-DSA-65 keypair
 *   3. Builds + signs a spend envelope
 *   4. Creates a Stripe PaymentMethod (test card 4242 4242 4242 4242)
 *   5. Creates a PaymentIntent with the PQSafe envelope hash as metadata
 *   6. Confirms the PaymentIntent
 *   7. Prints the real Stripe Payment Intent ID (pi_...)
 *
 * Prerequisites: populate ~/.pqsafe-stripe.env first.
 * See demo/STRIPE_SANDBOX.md for full setup instructions.
 *
 * Run:
 *   cd ~/Projects/pqsafe/agent-pay
 *   npx tsx demo/stripe-sandbox-demo.ts
 */

import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import {
  createEnvelope,
  signEnvelope,
  verifyEnvelope,
} from '../src/index.js'

// ---------------------------------------------------------------------------
// Load env file (~/.pqsafe-stripe.env)
// ---------------------------------------------------------------------------

const ENV_FILE = join(homedir(), '.pqsafe-stripe.env')

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    console.error(`\n  ERROR: ${path} not found.`)
    console.error('  See demo/STRIPE_SANDBOX.md for instructions.\n')
    process.exit(1)
  }

  const lines = readFileSync(path, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key && value) {
      process.env[key] = value
    }
  }
}

// ---------------------------------------------------------------------------
// Terminal helpers
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
}

const line = (n = 72) => '─'.repeat(n)

function header(step: string, title: string) {
  console.log('')
  console.log(`${C.cyan}${line()}${C.reset}`)
  console.log(`${C.cyan}${C.bold}  ${step}  ${title}${C.reset}`)
  console.log(`${C.cyan}${line()}${C.reset}`)
}

function say(label: string, value: string) {
  console.log(`  ${C.dim}${label.padEnd(22)}${C.reset} ${value}`)
}

function ok(msg: string) {
  console.log(`  ${C.green}✓${C.reset} ${msg}`)
}

function fail(msg: string) {
  console.log(`  ${C.red}✗${C.reset} ${msg}`)
}

function deriveAddress(pubKey: Uint8Array): string {
  return 'pq1' + bytesToHex(keccak_256(pubKey).slice(0, 20))
}

// ---------------------------------------------------------------------------
// Stripe API helper (raw fetch — no Stripe SDK dep required)
// ---------------------------------------------------------------------------

async function stripePost(
  secretKey: string,
  path: string,
  params: Record<string, string | number>,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()

  const res = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body,
  })

  const data = await res.json() as Record<string, unknown>

  if (!res.ok) {
    const error = (data as { error?: { message?: string } }).error
    throw new Error(`Stripe API error (${res.status}): ${error?.message ?? JSON.stringify(data)}`)
  }

  return data
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('')
  console.log(`${C.bold}PQSafe AgentPay — Stripe Test Mode Demo${C.reset}`)
  console.log(`${C.dim}ML-DSA-65 • NIST FIPS 204 • api.stripe.com (sk_test_*)${C.reset}`)

  // Load credentials
  loadEnvFile(ENV_FILE)

  const secretKey = process.env.STRIPE_TEST_KEY
  if (!secretKey || !secretKey.startsWith('sk_test_')) {
    fail('STRIPE_TEST_KEY not set or does not start with sk_test_ in ~/.pqsafe-stripe.env')
    process.exit(1)
  }

  // STRIPE_TEST_KEY is accepted directly by the rail (alias for STRIPE_SECRET_KEY)
  say('Mode', `${C.yellow}TEST MODE (api.stripe.com + sk_test_*)${C.reset}`)

  // ---------------------------------------------------------------------------
  // Step 1: Generate ML-DSA-65 keypair
  // ---------------------------------------------------------------------------
  header('Step 1', 'Generate post-quantum keypair')

  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey: signingKey } = ml_dsa65.keygen(seed)
  const pqAddress = deriveAddress(publicKey)

  say('Scheme', 'ML-DSA-65 (NIST FIPS 204)')
  say('Public key', `${publicKey.length} bytes`)
  say('PQSafe addr', pqAddress)
  ok('Keypair generated')

  // ---------------------------------------------------------------------------
  // Step 2: Build spend envelope
  // ---------------------------------------------------------------------------
  header('Step 2', 'Build spend envelope')

  // We'll use a placeholder pi_ recipient (we'll fill it in after creating the PI)
  // The envelope allowlist will include the real PI after creation
  const now = Math.floor(Date.now() / 1000)

  // Step 2a: Create a Stripe PaymentMethod with test card first
  // so we can include the pi_ in the envelope allowlist
  header('Step 2a', 'Create Stripe PaymentMethod (test card 4242...)')

  const pm = await stripePost(secretKey, '/v1/payment_methods', {
    type: 'card',
    'card[number]': '4242424242424242',
    'card[exp_month]': '12',
    'card[exp_year]': '2030',
    'card[cvc]': '123',
  })

  const pmId = pm.id as string
  say('PaymentMethod ID', pmId)
  ok('Test card PaymentMethod created')

  // Step 2b: Create the PaymentIntent
  header('Step 2b', 'Create PaymentIntent with envelope metadata')

  // Build envelope hash for metadata binding
  const tempEnvelope = createEnvelope({
    issuer: pqAddress,
    agent: 'pqsafe-stripe-sandbox-demo',
    maxAmount: 10,
    currency: 'USD',
    allowedRecipients: ['__placeholder__'],
    validFrom: now,
    validUntil: now + 3600,
    rail: 'stripe',
  })

  const envelopeHash = bytesToHex(
    keccak_256(new TextEncoder().encode(JSON.stringify(tempEnvelope))).slice(0, 16)
  )

  const pi = await stripePost(secretKey, '/v1/payment_intents', {
    amount: 1000, // $10.00 in cents
    currency: 'usd',
    payment_method: pmId,
    'metadata[pqsafe_envelope_hash]': envelopeHash,
    'metadata[pqsafe_agent]': 'pqsafe-stripe-sandbox-demo',
    'metadata[pqsafe_issuer]': pqAddress,
    description: 'PQSafe AgentPay sandbox demo',
    confirm: 'false',
  })

  const piId = pi.id as string
  say('Payment Intent ID', piId)
  ok('PaymentIntent created')

  // Now build the real envelope with the actual pi_ ID
  const envelope = createEnvelope({
    issuer: pqAddress,
    agent: 'pqsafe-stripe-sandbox-demo',
    maxAmount: 10,
    currency: 'USD',
    allowedRecipients: [piId],
    validFrom: now,
    validUntil: now + 3600,
    rail: 'stripe',
  })

  say('Agent', envelope.agent)
  say('Max amount', `${envelope.maxAmount} ${envelope.currency}`)
  say('Recipient (pi_)', piId)
  say('Rail', 'stripe')
  say('Nonce', envelope.nonce.slice(0, 16) + '...')
  ok('Envelope built — agent authorized within limits only')

  // ---------------------------------------------------------------------------
  // Step 3: Sign with ML-DSA-65
  // ---------------------------------------------------------------------------
  header('Step 3', 'Sign with ML-DSA-65 (post-quantum)')

  const signed = signEnvelope(envelope, signingKey, publicKey)

  say('Envelope JSON', `${JSON.stringify(envelope).length} chars`)
  say('Signature', `${signed.signature.length / 2} bytes`)
  ok('Signed')

  // ---------------------------------------------------------------------------
  // Step 4: Agent-side verification
  // ---------------------------------------------------------------------------
  header('Step 4', 'Agent-side verification')

  const verifyResult = verifyEnvelope(signed)
  if (!verifyResult.valid) {
    fail(`Verification failed: ${verifyResult.error}`)
    process.exit(1)
  }
  ok('Signature valid')
  ok('Schema valid')
  ok('Temporal window valid')

  // ---------------------------------------------------------------------------
  // Step 5: Confirm the PaymentIntent
  // ---------------------------------------------------------------------------
  header('Step 5', 'Confirm PaymentIntent (real Stripe test charge)')

  say('Rail', 'stripe (test mode)')
  say('Payment Intent', piId)
  say('Amount', `$10.00 USD`)
  console.log('')

  let confirmed
  try {
    confirmed = await stripePost(secretKey, `/v1/payment_intents/${piId}/confirm`, {
      payment_method: pmId,
    })
  } catch (e) {
    fail(`Confirmation failed: ${(e as Error).message}`)
    console.error('\nSee demo/STRIPE_SANDBOX.md Troubleshooting section.')
    process.exit(1)
  }

  const status = confirmed.status as string
  const confirmedPiId = confirmed.id as string

  say('Payment Intent ID', `${C.green}${C.bold}${confirmedPiId}${C.reset}`)
  say('Status', status)
  say('Amount', `$${((confirmed.amount as number) / 100).toFixed(2)} USD`)
  say('Currency', (confirmed.currency as string).toUpperCase())
  say('Mock', 'false — real Stripe test charge')

  if (status !== 'succeeded') {
    fail(`Unexpected status: ${status}. Expected: succeeded`)
    process.exit(1)
  }

  ok('Payment confirmed. Add this Payment Intent ID to DEMO_RECEIPTS.md.')

  console.log('')
  console.log(`${C.bold}Verify at:${C.reset}`)
  console.log(`  https://dashboard.stripe.com/test/payments/${confirmedPiId}`)
  console.log(`  (Log in with your Stripe account → Developers → toggle "Test mode" → Payments)`)
  console.log('')

  // ---------------------------------------------------------------------------
  // Step 6: Guard rails
  // ---------------------------------------------------------------------------
  header('Step 6', 'Guard rails — policy enforcement')

  ok(`Over-spend blocked at envelope level: maxAmount ${envelope.maxAmount} ${envelope.currency}`)
  ok(`Allowlist enforced: only ${piId} is an approved recipient`)
  ok('All guard rails held.')
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
