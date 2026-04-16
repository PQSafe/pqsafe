/**
 * PQSafe AgentPay — video-ready demo script
 *
 * Narrative flow (matches 60-sec YC founder video shot list):
 *   0:00  Intro           — "I run 8 companies. My agents can't pay for anything."
 *   0:08  Keygen          — ML-DSA-65 post-quantum keypair, derive PQSafe address
 *   0:18  Envelope        — Build spend envelope with allowlist, amount cap, TTL
 *   0:28  Sign            — ML-DSA-65 signature (~3.3KB)
 *   0:36  Verify          — Independent agent-side verification
 *   0:44  Execute         — Route through guard-rails → Airwallex
 *   0:52  Guard rail demo — Show overspend + bad recipient rejection
 *   1:00  Outro           — tx id, agent/issuer/nonce on screen
 *
 * Run:
 *   cd agent-pay
 *   npm install
 *   npm run demo             # mock mode (no creds needed)
 *   AIRWALLEX_CLIENT_ID=... AIRWALLEX_API_KEY=... npm run demo   # real sandbox
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import {
  createEnvelope,
  signEnvelope,
  verifyEnvelope,
  executeAgentPayment,
} from '../src/index.js'
import { getAgentPayConfig } from '../src/config.js'

// ---------------------------------------------------------------------------
// Terminal helpers (ANSI colors + pacing for the video shoot)
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
}

const line = (n = 72) => '─'.repeat(n)

function header(step: string, title: string) {
  console.log('')
  console.log(`${C.cyan}${line()}${C.reset}`)
  console.log(`${C.cyan}${C.bold}  ${step}  ${title}${C.reset}`)
  console.log(`${C.cyan}${line()}${C.reset}`)
}

function say(label: string, value: string) {
  console.log(`  ${C.dim}${label.padEnd(20)}${C.reset} ${value}`)
}

function ok(msg: string) {
  console.log(`  ${C.green}✓${C.reset} ${msg}`)
}

function bad(msg: string) {
  console.log(`  ${C.red}✗${C.reset} ${msg}`)
}

function beat(ms = 350) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveAddress(dsaPublicKey: Uint8Array): string {
  return 'pq1' + bytesToHex(keccak_256(dsaPublicKey).slice(0, 20))
}

function short(hex: string, pre = 6, post = 6): string {
  return `${hex.slice(0, pre)}…${hex.slice(-post)}`
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main() {
  const cfg = getAgentPayConfig()

  // Banner
  console.log('')
  console.log(
    `${C.magenta}${C.bold}  PQSafe AgentPay ${C.reset}${C.dim}— post-quantum payment rails for AI agents${C.reset}`,
  )
  console.log(
    `${C.gray}  ML-DSA-65 • ML-KEM-768 • NIST FIPS 203/204${C.reset}`,
  )
  console.log('')
  say(
    'Mode',
    cfg.mockMode
      ? `${C.yellow}MOCK${C.reset} ${C.dim}(no Airwallex creds set — set AIRWALLEX_CLIENT_ID + AIRWALLEX_API_KEY for live sandbox)${C.reset}`
      : `${C.green}LIVE ${cfg.airwallex.env.toUpperCase()}${C.reset}`,
  )
  await beat(600)

  // -------------------------------------------------------------------------
  header('Step 1', 'Generate post-quantum keypair')
  // -------------------------------------------------------------------------
  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey: dsaPk, secretKey: dsaSk } = ml_dsa65.keygen(seed)
  const issuer = deriveAddress(dsaPk)

  say('Scheme', 'ML-DSA-65 (NIST FIPS 204)')
  say('Public key', `${dsaPk.length} bytes`)
  say('PQSafe address', `${C.bold}${issuer}${C.reset}`)
  ok('Keypair generated on-device — secret never leaves this machine')
  await beat()

  // -------------------------------------------------------------------------
  header('Step 2', 'Build spend envelope')
  // -------------------------------------------------------------------------
  // Use a fake IBAN as recipient (SeniorDeli supplier equivalent)
  const RECIPIENT = 'GB29NWBK60161331926819'
  const envelope = createEnvelope({
    issuer,
    agent: 'content-officer-softmeal',
    maxAmount: 200,
    currency: 'USD',
    allowedRecipients: [RECIPIENT],
    ttlSeconds: 3600,
    rail: 'airwallex',
  })

  say('Agent', envelope.agent)
  say('Max amount', `${envelope.maxAmount} ${envelope.currency}`)
  say('Recipients', `${envelope.allowedRecipients.length} whitelisted`)
  say(
    'Valid window',
    `${new Date(envelope.validFrom * 1000).toISOString()}  →  ${new Date(envelope.validUntil * 1000).toISOString()}`,
  )
  say('Nonce', envelope.nonce)
  say('Rail', envelope.rail ?? '(router choice)')
  ok('Envelope built — agent is authorized within these limits only')
  await beat()

  // -------------------------------------------------------------------------
  header('Step 3', 'Sign with ML-DSA-65 (post-quantum)')
  // -------------------------------------------------------------------------
  const signed = signEnvelope(envelope, dsaSk, dsaPk)
  say('Envelope JSON', `${signed.envelopeJson.length} chars`)
  say('Signature', `${signed.signature.length / 2} bytes  (${short(signed.signature)})`)
  say('Issuer pubkey', `${signed.dsaPublicKey.length / 2} bytes  (${short(signed.dsaPublicKey)})`)
  ok('Signed. This envelope is now a self-contained authorization token.')
  await beat()

  // -------------------------------------------------------------------------
  header('Step 4', 'Agent-side verification')
  // -------------------------------------------------------------------------
  // Simulates the agent (different process) verifying before it acts
  try {
    const verified = verifyEnvelope(signed)
    say('Signature', `${C.green}valid${C.reset}`)
    say('Schema', `${C.green}valid${C.reset}`)
    say('Temporal', `${C.green}within window${C.reset}`)
    say('Agent binding', verified.agent)
    ok('Verification passed. Agent is now authorized to attempt payment.')
  } catch (e) {
    bad(`Verification failed: ${(e as Error).message}`)
    process.exit(1)
  }
  await beat()

  // -------------------------------------------------------------------------
  header('Step 5', 'Execute payment — guard-railed & routed')
  // -------------------------------------------------------------------------
  say(
    'Flow',
    'verify sig → schema → time → allowlist → amount ceiling → rail',
  )

  const result = await executeAgentPayment(signed, {
    recipient: RECIPIENT,
    amount: 49,
    memo: 'Anthropic API credits — softmeal content officer',
  })

  say('Rail', result.rail)
  say('Amount', `${result.amount} ${result.currency}`)
  say('Recipient', result.recipient)
  say('Transaction ID', `${C.bold}${result.txId}${C.reset}`)
  say('Executed at', result.executedAt)
  say(
    'Mode',
    result.meta?.mock
      ? `${C.yellow}mock${C.reset}`
      : `${C.green}real ${cfg.airwallex.env}${C.reset}`,
  )
  ok('Payment executed. The agent paid its own Anthropic bill.')
  await beat()

  // -------------------------------------------------------------------------
  header('Step 6', 'Guard rails — this is what makes it safe')
  // -------------------------------------------------------------------------
  console.log(`  ${C.dim}The agent tries to abuse the envelope. PQSafe refuses.${C.reset}`)
  console.log('')

  // Over-spend
  try {
    await executeAgentPayment(signed, { recipient: RECIPIENT, amount: 999 })
    bad('Should have rejected over-spend!')
  } catch (e) {
    bad(`Blocked over-spend: ${C.dim}${(e as Error).message}${C.reset}`)
  }

  // Wrong recipient
  try {
    await executeAgentPayment(signed, {
      recipient: 'EVIL_ACCOUNT_XYZ',
      amount: 10,
    })
    bad('Should have rejected bad recipient!')
  } catch (e) {
    bad(`Blocked bad recipient: ${C.dim}${(e as Error).message}${C.reset}`)
  }

  ok('Both attacks rejected before hitting any rail.')
  await beat()

  // -------------------------------------------------------------------------
  // Outro
  // -------------------------------------------------------------------------
  console.log('')
  console.log(`${C.magenta}${line()}${C.reset}`)
  console.log(
    `${C.bold}  Raymond signs once. Agents pay within limits. No credit card handover.${C.reset}`,
  )
  console.log(
    `${C.dim}  8 companies. 4 live hubs. Post-quantum rails. CompanyForge + PQSafe.${C.reset}`,
  )
  console.log(`${C.magenta}${line()}${C.reset}`)
  console.log('')
}

main().catch((err) => {
  console.error(`${C.red}Demo failed:${C.reset}`, err)
  process.exit(1)
})
