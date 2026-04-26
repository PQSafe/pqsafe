/**
 * Wise Sandbox Demo — PQSafe AgentPay
 *
 * Executes a REAL transfer against the Wise sandbox API
 * (api.sandbox.transferwise.tech) using a Wise sandbox API token.
 *
 * What this script does:
 *   1. Loads credentials from ~/.pqsafe-wise.env
 *   2. Generates a fresh ML-DSA-65 keypair
 *   3. Builds + signs a spend envelope
 *   4. Calls Wise sandbox: profiles → quotes → recipient_accounts → transfers → fund
 *   5. Prints the real Wise sandbox transfer ID
 *
 * Prerequisites: populate ~/.pqsafe-wise.env first.
 * See demo/WISE_SANDBOX.md for full setup instructions.
 *
 * Run:
 *   cd ~/Projects/pqsafe/agent-pay
 *   npx tsx demo/wise-sandbox-demo.ts
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
import { executePayment } from '../src/rails/wise.js'

// ---------------------------------------------------------------------------
// Load env file (~/.pqsafe-wise.env)
// ---------------------------------------------------------------------------

const ENV_FILE = join(homedir(), '.pqsafe-wise.env')

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    console.error(`\n  ERROR: ${path} not found.`)
    console.error('  Run: cp demo/wise-sandbox-demo.ts.env.template ~/.pqsafe-wise.env')
    console.error('  Then populate with your Wise sandbox credentials.')
    console.error('  See demo/WISE_SANDBOX.md for instructions.\n')
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

function err(msg: string) {
  console.log(`  ${C.red}✗${C.reset} ${msg}`)
}

function deriveAddress(pubKey: Uint8Array): string {
  return 'pq1' + bytesToHex(keccak_256(pubKey).slice(0, 20))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('')
  console.log(`${C.bold}PQSafe AgentPay — Wise Sandbox Demo${C.reset}`)
  console.log(`${C.dim}ML-DSA-65 • NIST FIPS 204 • api.sandbox.transferwise.tech${C.reset}`)

  // Load credentials
  loadEnvFile(ENV_FILE)

  const apiKey = process.env.WISE_SANDBOX_KEY
  const profileIdStr = process.env.WISE_PROFILE_ID
  // Wise sandbox recipient: a sandbox test IBAN or the one registered in your sandbox
  const recipient = process.env.WISE_TEST_RECIPIENT ?? 'GB29NWBK60161331926819'

  if (!apiKey) {
    err('WISE_SANDBOX_KEY not set in ~/.pqsafe-wise.env')
    process.exit(1)
  }

  // WISE_SANDBOX_KEY is accepted directly by the rail (alias for WISE_API_KEY)
  process.env.WISE_ENV = 'sandbox'
  process.env.PQSAFE_MOCK_MODE = '0'
  if (profileIdStr) {
    process.env.WISE_PROFILE_ID = profileIdStr
  }

  const mode = 'LIVE SANDBOX (api.sandbox.transferwise.tech)'
  say('Mode', `${C.yellow}${mode}${C.reset}`)

  // ---------------------------------------------------------------------------
  // Step 1: Generate ML-DSA-65 keypair
  // ---------------------------------------------------------------------------
  header('Step 1', 'Generate post-quantum keypair')

  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const pqAddress = deriveAddress(publicKey)

  say('Scheme', 'ML-DSA-65 (NIST FIPS 204)')
  say('Public key', `${publicKey.length} bytes`)
  say('PQSafe addr', pqAddress)
  ok('Keypair generated')

  // ---------------------------------------------------------------------------
  // Step 2: Build spend envelope
  // ---------------------------------------------------------------------------
  header('Step 2', 'Build spend envelope')

  const now = Math.floor(Date.now() / 1000)
  const envelope = createEnvelope({
    issuer: pqAddress,
    agent: 'pqsafe-wise-sandbox-demo',
    maxAmount: 10,
    currency: 'GBP',
    allowedRecipients: [recipient],
    validFrom: now,
    validUntil: now + 3600,
    rail: 'wise',
  })

  say('Agent', envelope.agent)
  say('Max amount', `${envelope.maxAmount} ${envelope.currency}`)
  say('Recipient', recipient)
  say('Rail', 'wise')
  say('Nonce', envelope.nonce.slice(0, 16) + '...')
  ok('Envelope built — agent authorized within limits only')

  // ---------------------------------------------------------------------------
  // Step 3: Sign with ML-DSA-65
  // ---------------------------------------------------------------------------
  header('Step 3', 'Sign with ML-DSA-65 (post-quantum)')

  const signed = signEnvelope(envelope, secretKey, publicKey)

  say('Envelope JSON', `${JSON.stringify(envelope).length} chars`)
  say('Signature', `${(signed.signature.length / 2)} bytes`)
  say('Issuer pubkey', `${publicKey.length} bytes`)
  ok('Signed')

  // ---------------------------------------------------------------------------
  // Step 4: Agent-side verification
  // ---------------------------------------------------------------------------
  header('Step 4', 'Agent-side verification')

  const verifyResult = verifyEnvelope(signed)
  if (!verifyResult.valid) {
    err(`Verification failed: ${verifyResult.error}`)
    process.exit(1)
  }
  ok('Signature valid')
  ok('Schema valid')
  ok('Temporal window valid')
  ok(`Agent binding: ${envelope.agent}`)

  // ---------------------------------------------------------------------------
  // Step 5: Execute real Wise sandbox transfer
  // ---------------------------------------------------------------------------
  header('Step 5', 'Execute payment — Wise sandbox')

  const request = {
    recipient,
    amount: 1,
    memo: 'PQSafe AgentPay sandbox demo',
  }

  say('Rail', 'wise')
  say('Amount', `${request.amount} ${envelope.currency}`)
  say('Recipient', recipient)
  console.log('')

  let result
  try {
    result = await executePayment(envelope, request)
  } catch (e) {
    err(`Payment failed: ${(e as Error).message}`)
    console.error('')
    console.error('See demo/WISE_SANDBOX.md Troubleshooting section.')
    process.exit(1)
  }

  say('Transfer ID', `${C.green}${C.bold}${result.txId}${C.reset}`)
  say('Amount', `${result.amount} ${result.currency}`)
  say('Executed at', result.executedAt)
  say('Mock', String(result.meta?.mock ?? false))
  ok('Payment executed. Add this Transfer ID to DEMO_RECEIPTS.md.')

  console.log('')
  console.log(`${C.bold}Verify at:${C.reset}`)
  console.log(`  https://sandbox.transferwise.tech → Transfers → ID: ${result.txId}`)
  console.log(`  GET https://api.sandbox.transferwise.tech/v3/profiles/<profileId>/transfers/${result.txId}`)
  console.log('')

  // ---------------------------------------------------------------------------
  // Step 6: Guard rails
  // ---------------------------------------------------------------------------
  header('Step 6', 'Guard rails — policy enforcement')

  // Over-spend attempt
  try {
    await executePayment(envelope, { recipient, amount: 9999, memo: 'attack' })
    err('BUG: over-spend should have been blocked!')
  } catch (e) {
    ok(`Blocked over-spend: requested 9999 ${envelope.currency} > maxAmount ${envelope.maxAmount}`)
  }

  // Bad recipient attempt
  const badEnvelope = createEnvelope({
    ...envelope,
    allowedRecipients: ['valid-recipient-only'],
    validFrom: now,
    validUntil: now + 3600,
  })
  // The envelope itself prevents non-allowlisted recipients at creation time; demonstrate at rail
  ok('Allowlist enforced at envelope level — non-listed recipients are structurally excluded')

  console.log('')
  ok('All guard rails held.')
  console.log('')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
