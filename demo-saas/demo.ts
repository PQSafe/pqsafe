/**
 * PQSafe AgentPay — SaaS Self-Pay Demo
 *
 * Scenario: A research agent is mid-task and determines it needs Perplexity Pro
 * API access. It checks its PQSafe SpendEnvelope (budget: $50/month for
 * "research tools"), autonomously purchases the subscription, and continues
 * its task — without any human logging in or entering a credit card.
 *
 * This is the hero demo for PQSafe AgentPay.
 *
 * Run:
 *   cd agent-pay
 *   npm install
 *   npx tsx ../demo-saas/demo.ts             # mock mode — no creds needed
 *   AIRWALLEX_CLIENT_ID=... AIRWALLEX_API_KEY=... npx tsx ../demo-saas/demo.ts
 */

// Run from pqsafe/agent-pay/: npx tsx ../demo-saas/demo.ts
// Or from pqsafe repo root: cd agent-pay && npx tsx ../demo-saas/demo.ts
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import {
  createEnvelope,
  signEnvelope,
  verifyEnvelope,
  executeAgentPayment,
  getAgentPayConfig,
} from '../agent-pay/src/index.js'

// ---------------------------------------------------------------------------
// Terminal helpers
// ---------------------------------------------------------------------------

const C = {
  reset:   '\x1b[0m',
  dim:     '\x1b[2m',
  bold:    '\x1b[1m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  gray:    '\x1b[90m',
  white:   '\x1b[97m',
}

const line   = (n = 72) => '─'.repeat(n)
const dline  = (n = 72) => '═'.repeat(n)

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

function warn(msg: string) {
  console.log(`  ${C.yellow}⚠${C.reset} ${msg}`)
}

function bad(msg: string) {
  console.log(`  ${C.red}✗${C.reset} ${msg}`)
}

function agentLog(msg: string) {
  console.log(`  ${C.blue}[research-agent]${C.reset} ${msg}`)
}

function beat(ms = 400) {
  return new Promise<void>((r) => setTimeout(r, ms))
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

function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`
}

// ---------------------------------------------------------------------------
// Simulated virtual card (represents PQSafe-issued Airwallex Virtual Card)
// In production: POST /issuing/cards → Airwallex returns real VCN
// ---------------------------------------------------------------------------

interface VirtualCard {
  cardNumber: string  // 16-digit PAN (masked for display)
  last4: string
  expiry: string
  cvv: string
  billingZip: string
  envelopeBound: string  // nonce of the envelope that issued this card
  spendCap: number
  currency: string
}

function issueVirtualCard(envelopeNonce: string, spendCap: number, currency: string): VirtualCard {
  // In production: Airwallex POST /issuing/cards with spend_limit = spendCap
  // Returns a real Visa card number. Here we simulate the returned PAN.
  const mockPan = `4532 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`
  const last4    = mockPan.slice(-4)
  const expMo    = String(new Date().getMonth() + 2).padStart(2, '0')
  const expYr    = String(new Date().getFullYear() + 1).slice(2)
  return {
    cardNumber:     mockPan,
    last4,
    expiry:         `${expMo}/${expYr}`,
    cvv:            String(Math.floor(100 + Math.random() * 900)),
    billingZip:     '94105',
    envelopeBound:  envelopeNonce,
    spendCap,
    currency,
  }
}

// ---------------------------------------------------------------------------
// Main demo
// ---------------------------------------------------------------------------

async function main() {
  const cfg = getAgentPayConfig()

  // ── Banner ────────────────────────────────────────────────────────────────
  console.log('')
  console.log(`${C.magenta}${dline()}${C.reset}`)
  console.log(`${C.magenta}${C.bold}  PQSafe AgentPay  ·  SaaS Self-Pay Demo${C.reset}`)
  console.log(`${C.magenta}${C.dim}  An AI agent buys its own API access. No human needed.${C.reset}`)
  console.log(`${C.magenta}${dline()}${C.reset}`)
  console.log('')
  say(
    'Mode',
    cfg.mockMode
      ? `${C.yellow}MOCK${C.reset} ${C.dim}(set AIRWALLEX_CLIENT_ID + AIRWALLEX_API_KEY for live sandbox)${C.reset}`
      : `${C.green}LIVE ${cfg.airwallex.env.toUpperCase()}${C.reset}`,
  )
  say('Scenario', 'Research agent needs Perplexity Pro — autonomously purchases it')
  await beat(600)

  // ── Step 1: Human provisions wallet + envelope (done once, ahead of time) ─
  header('Step 1', 'Human provisions a PQ wallet (one-time setup)')

  agentLog('(offline) Human generates ML-DSA-65 keypair and issues a SpendEnvelope.')
  await beat(300)

  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey: dsaPk, secretKey: dsaSk } = ml_dsa65.keygen(seed)
  const issuer = deriveAddress(dsaPk)

  say('Scheme',    'ML-DSA-65 (NIST FIPS 204)')
  say('Issuer',    `${C.bold}${issuer}${C.reset}`)
  say('Public key', `${dsaPk.length} bytes  (${short(bytesToHex(dsaPk))})`)
  ok('Keypair generated on-device — secret key never leaves the wallet')
  await beat()

  // ── Step 2: Create + sign a SpendEnvelope for research tools ──────────────
  header('Step 2', 'Issue a SpendEnvelope: "research-agent gets $50 for research tools"')

  // The recipient identifier here is the Airwallex virtual card charge endpoint
  // or a SaaS vendor identifier. In the virtual card model, this is the
  // card network identifier for "perplexity.ai" (their merchant ID or billing email).
  // For the wire/ACH model this would be their bank account.
  const PERPLEXITY_RECIPIENT = 'perplexity.ai'

  const envelope = createEnvelope({
    issuer,
    agent:            'research-agent-v1',
    maxAmount:        50,
    currency:         'USD',
    allowedRecipients: [PERPLEXITY_RECIPIENT],
    ttlSeconds:       30 * 24 * 3600,    // 30 days (monthly subscription window)
    rail:             'airwallex',
  })

  say('Agent',       envelope.agent)
  say('Max spend',   `${C.bold}${formatUSD(envelope.maxAmount)} USD / month${C.reset}`)
  say('Purpose',     'Research tools (allowlist: perplexity.ai only)')
  say('TTL',         `30 days → expires ${new Date(envelope.validUntil * 1000).toISOString().split('T')[0]}`)
  say('Rail',        envelope.rail ?? 'router default')
  say('Nonce',       envelope.nonce)
  ok('Envelope built — agent is capped at $50, only to perplexity.ai')
  await beat()

  // ── Step 3: Sign with ML-DSA-65 ───────────────────────────────────────────
  header('Step 3', 'Human signs envelope with ML-DSA-65 (post-quantum)')

  const signed = signEnvelope(envelope, dsaSk, dsaPk)

  say('Envelope JSON', `${signed.envelopeJson.length} chars`)
  say('Signature',     `${signed.signature.length / 2} bytes  (${short(signed.signature)})`)
  say('Pubkey',        `${signed.dsaPublicKey.length / 2} bytes  (${short(signed.dsaPublicKey)})`)
  ok('SignedEnvelope is now a portable, tamper-proof authorization token.')
  ok('Agent can carry this across restarts, containers, and function invocations.')
  await beat()

  // ── Step 4: Agent is mid-task — discovers it needs Perplexity ─────────────
  header('Step 4', 'Agent mid-task: detects it needs Perplexity Pro access')

  console.log('')
  agentLog('Running: "Summarise latest AI safety research from last 90 days…"')
  await beat(500)
  agentLog(`${C.yellow}BLOCKED${C.reset} — Perplexity API returned 402 Payment Required.`)
  agentLog('Free tier exhausted. Perplexity Pro subscription: $20/month.')
  agentLog(`Checking PQSafe SpendEnvelope…`)
  await beat(400)

  // ── Step 5: Agent verifies envelope (independent guard-rail check) ─────────
  header('Step 5', 'Agent verifies envelope before spending')

  let verifiedEnvelope
  try {
    verifiedEnvelope = verifyEnvelope(signed)
    say('Signature',    `${C.green}valid${C.reset}`)
    say('Schema',       `${C.green}valid${C.reset}`)
    say('Temporal',     `${C.green}within window${C.reset}`)
    say('Agent match',  verifiedEnvelope.agent)
    say('Budget',       `${C.green}${formatUSD(verifiedEnvelope.maxAmount)} available${C.reset}`)
    say('Perplexity',   verifiedEnvelope.allowedRecipients.includes(PERPLEXITY_RECIPIENT)
      ? `${C.green}in allowlist ✓${C.reset}`
      : `${C.red}NOT in allowlist ✗${C.reset}`)
    ok('Envelope valid. Budget check passed. Proceeding to pay autonomously.')
  } catch (e) {
    bad(`Envelope invalid: ${(e as Error).message}`)
    process.exit(1)
  }
  await beat()

  // ── Step 6: Issue virtual card for this envelope ───────────────────────────
  header('Step 6', 'PQSafe issues a virtual Visa card bound to this envelope')

  const vcard = issueVirtualCard(envelope.nonce, envelope.maxAmount, envelope.currency)

  console.log('')
  console.log(`  ${C.dim}In production: POST /issuing/cards to Airwallex with spend_limit=${envelope.maxAmount}${C.reset}`)
  console.log(`  ${C.dim}Airwallex returns a real Visa PAN. The card hard-expires when envelope expires.${C.reset}`)
  console.log('')

  say('Card number',  `**** **** **** ${vcard.last4}  ${C.dim}(Visa, Airwallex Issuing)${C.reset}`)
  say('Expiry',       vcard.expiry)
  say('Spend cap',    `${formatUSD(vcard.spendCap)} ${vcard.currency}  ${C.dim}(hard-capped by envelope)${C.reset}`)
  say('Bound to',     `nonce ${vcard.envelopeBound.slice(0, 12)}…`)
  ok('Virtual card issued. Card number can be used at any SaaS checkout.')
  ok('Spend cap enforced at Airwallex network level — no overspend possible.')
  await beat()

  // ── Step 7: Execute payment via PQSafe ────────────────────────────────────
  header('Step 7', 'Agent pays for Perplexity Pro — $20.00 USD')

  const SUBSCRIPTION_AMOUNT = 20
  say('Flow', 'verify sig → schema → time → allowlist → amount ceiling → rail')
  await beat(300)

  let receipt
  try {
    receipt = await executeAgentPayment(signed, {
      recipient: PERPLEXITY_RECIPIENT,
      amount:    SUBSCRIPTION_AMOUNT,
      memo:      'Perplexity Pro subscription — research-agent-v1 monthly',
    })

    say('Rail',           receipt.rail)
    say('Amount charged', `${C.bold}${C.green}${formatUSD(receipt.amount)} USD${C.reset}`)
    say('Recipient',      receipt.recipient)
    say('Transaction ID', `${C.bold}${receipt.txId}${C.reset}`)
    say('Executed at',    receipt.executedAt)
    say(
      'Mode',
      receipt.meta?.mock
        ? `${C.yellow}mock${C.reset}`
        : `${C.green}real ${cfg.airwallex.env}${C.reset}`,
    )
    ok('Payment executed. Subscription active.')
  } catch (e) {
    bad(`Payment failed: ${(e as Error).message}`)
    process.exit(1)
  }
  await beat()

  // ── Step 8: Agent continues task ──────────────────────────────────────────
  header('Step 8', 'Agent resumes task with Perplexity Pro access')

  console.log('')
  agentLog(`${C.green}Perplexity Pro subscription activated.${C.reset}`)
  agentLog(`${C.green}API key received. Resuming research task…${C.reset}`)
  await beat(400)
  agentLog('Querying: "AI safety research — last 90 days"…')
  await beat(600)
  agentLog(`${C.green}Query complete. 47 papers found. Generating summary.${C.reset}`)
  await beat(300)
  console.log('')

  const remaining = envelope.maxAmount - SUBSCRIPTION_AMOUNT
  ok(`Agent successfully purchased Perplexity Pro subscription. Remaining budget: ${formatUSD(remaining)}/month.`)
  await beat()

  // ── Guard rails demo ───────────────────────────────────────────────────────
  header('Bonus', 'Guard rails — the agent cannot abuse the envelope')

  console.log(`  ${C.dim}What if the agent tries to overspend or pay a bad recipient?${C.reset}`)
  console.log('')

  // Overspend
  try {
    await executeAgentPayment(signed, { recipient: PERPLEXITY_RECIPIENT, amount: 9999 })
    bad('Should have blocked overspend!')
  } catch (e) {
    warn(`Blocked overspend ($9,999):  ${C.dim}${(e as Error).message}${C.reset}`)
  }

  // Wrong recipient
  try {
    await executeAgentPayment(signed, { recipient: 'evil-vendor.io', amount: 10 })
    bad('Should have blocked bad recipient!')
  } catch (e) {
    warn(`Blocked bad recipient:       ${C.dim}${(e as Error).message}${C.reset}`)
  }

  ok('Both attacks blocked before touching Airwallex.')
  await beat()

  // ── Final receipt summary ──────────────────────────────────────────────────
  console.log('')
  console.log(`${C.magenta}${dline()}${C.reset}`)
  console.log(`${C.bold}  RECEIPT${C.reset}`)
  console.log(`${C.magenta}${dline()}${C.reset}`)
  console.log('')
  say('Agent',            envelope.agent)
  say('Service purchased', 'Perplexity Pro (perplexity.ai)')
  say('Amount',           `${formatUSD(SUBSCRIPTION_AMOUNT)} USD`)
  say('Remaining budget', `${formatUSD(remaining)} / ${formatUSD(envelope.maxAmount)} USD`)
  say('Transaction ID',   receipt!.txId)
  say('Authorized by',    `ML-DSA-65 spend envelope (issuer: ${short(issuer)})`)
  say('Envelope nonce',   envelope.nonce)
  say('Human logged in?', `${C.bold}${C.green}No.${C.reset}`)
  say('Credit card shared?', `${C.bold}${C.green}No.${C.reset}`)
  say('Prompt injection risk?', `${C.bold}${C.green}Zero — PQ signature is non-forgeable.${C.reset}`)
  console.log('')
  console.log(`${C.magenta}${dline()}${C.reset}`)
  console.log(`${C.bold}  Human signs once. Agent pays within limits. No human in the loop.${C.reset}`)
  console.log(`${C.dim}  PQSafe AgentPay — ML-DSA-65 (NIST FIPS 204) — pqsafe.xyz${C.reset}`)
  console.log(`${C.magenta}${dline()}${C.reset}`)
  console.log('')
}

main().catch((err) => {
  console.error(`${C.red}Demo failed:${C.reset}`, err)
  process.exit(1)
})
