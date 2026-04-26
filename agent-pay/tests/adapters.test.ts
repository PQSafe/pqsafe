/**
 * PQSafe AgentPay — AP2 + ACP adapter test suite
 *
 * 20 test cases covering:
 *   - AP2 mandate ↔ SpendEnvelope round-trips (intent, cart, payment)
 *   - AP2 PQ verify (pass, tampered sig, wrong key, wrong size)
 *   - ACP SPT → SpendEnvelope cents conversion
 *   - ACP deactivated token throws
 *   - ACP missing allowedMerchants throws
 *   - ACP round-trip envelope → SPT params with correct multiplier
 *   - ACP multi-recipient throws (single-merchant constraint)
 *   - ACP non-stripe rail warns
 *
 * Run: tsx tests/adapters.test.ts
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import {
  ap2MandateToSpendEnvelope,
  spendEnvelopeToAp2Mandate,
  verifyAp2WithPqWrapper,
  acpTokenToSpendEnvelope,
  spendEnvelopeToAcpToken,
  type AP2,
  type StripeACP,
} from '../src/adapters/index.js'
import { canonicalJsonBytes } from '../src/canonical.js'

// ---------------------------------------------------------------------------
// Test harness (mirrors envelope.test.ts style)
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const failures: Array<{ name: string; err: string }> = []

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } catch (err) {
    failed++
    const msg = err instanceof Error ? err.message : String(err)
    failures.push({ name, err: msg })
    console.log(`  \x1b[31m✗\x1b[0m ${name}`)
    console.log(`    \x1b[90m${msg}\x1b[0m`)
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function assertThrows(
  fn: () => unknown | Promise<unknown>,
  match: RegExp | string,
  label: string,
) {
  let threw = false
  let errMsg = ''
  try {
    await fn()
  } catch (e) {
    threw = true
    errMsg = e instanceof Error ? e.message : String(e)
  }
  assert(threw, `${label}: expected throw, but nothing threw`)
  const ok =
    typeof match === 'string' ? errMsg.includes(match) : match.test(errMsg)
  assert(ok, `${label}: error "${errMsg}" did not match ${match}`)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function freshKeypair() {
  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const address = 'pq1' + bytesToHex(keccak_256(publicKey).slice(0, 20))
  return { publicKey, secretKey, address }
}

const NOW_ISO = new Date(Date.now() + 3600_000).toISOString() // 1h from now

function makeIntentMandate(agentId: string, issuerAddress: string): AP2.IntentMandate {
  return {
    type: 'intent',
    mandateId: 'mandate-intent-001',
    merchantId: 'merchant-xyz',
    description: 'Buy something nice',
    maxAmount: 150,
    currency: 'USD',
    expiresAt: NOW_ISO,
    agentId,
    issuerAddress,
  }
}

function makeCartMandate(agentId: string, issuerAddress: string): AP2.CartMandate {
  return {
    type: 'cart',
    mandateId: 'mandate-cart-001',
    merchantId: 'merchant-xyz',
    items: [{ label: 'Widget', amount: 75, currency: 'USD', quantity: 2 }],
    subtotal: 150,
    total: 165,
    currency: 'USD',
    expiresAt: NOW_ISO,
    agentId,
    issuerAddress,
  }
}

function makePaymentMandate(agentId: string, issuerAddress: string): AP2.PaymentMandate {
  return {
    type: 'payment',
    mandateId: 'mandate-pay-001',
    merchantId: 'merchant-xyz',
    amount: 165,
    currency: 'USD',
    paymentMethod: { supportedMethods: 'stripe' },
    recipientAddress: 'acct_1PXqBBGJhmH2PkST',
    expiresAt: NOW_ISO,
    agentId,
    issuerAddress,
  }
}

function makeActiveSpt(): StripeACP.SharedPaymentToken {
  return {
    id: 'spt_1PXqBBGJhmH2PkSTDemoToken123',
    object: 'shared_payment_token',
    paymentMethod: 'pm_1PXqBBGJhmH2PkSTDemoPayment',
    customer: 'cus_1234567890',
    agentId: 'my-agent-v1',
    active: true,
    amountUsed: 0,
    currency: 'USD',
    created: 1_700_000_000,
    lastUsed: null,
    usageLimits: {
      maxAmountPerTransaction: 10000, // $100.00 USD in cents
      allowedMerchants: ['acct_1PXqBBGJhmH2PkST'],
      expiresAt: '2026-12-31T23:59:59Z',
      currency: 'USD',
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function run() {
  console.log('')
  console.log('\x1b[35m\x1b[1m  PQSafe AgentPay — AP2 + ACP adapter suite\x1b[0m')
  console.log('\x1b[90m  Production AP2 + Stripe ACP adapter round-trips & guardrails\x1b[0m')
  console.log('')

  // =========================================================================
  // AP2 → SpendEnvelope → AP2 round-trips
  // =========================================================================

  await test('AP2 IntentMandate → SpendEnvelope preserves amount, currency, agent', () => {
    const { address } = freshKeypair()
    const mandate = makeIntentMandate('agent-001', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    assert(env.maxAmount === 150, `maxAmount should be 150, got ${env.maxAmount}`)
    assert(env.currency === 'USD', `currency should be USD, got ${env.currency}`)
    assert(env.agent === 'agent-001', `agent should be agent-001, got ${env.agent}`)
    assert(env.issuer === address, `issuer should match address`)
    assert(env.allowedRecipients[0] === 'merchant-xyz', `allowedRecipients[0] should be merchantId`)
    assert(/^[0-9a-f]{32}$/.test(env.nonce), `nonce should be 32 hex chars`)
    assert(env.version === 1, 'version should be 1')
  })

  await test('AP2 CartMandate → SpendEnvelope uses total as maxAmount', () => {
    const { address } = freshKeypair()
    const mandate = makeCartMandate('agent-002', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    assert(env.maxAmount === 165, `maxAmount should be cart total 165, got ${env.maxAmount}`)
    assert(env.currency === 'USD', `currency should be USD`)
    assert(env.agent === 'agent-002', `agent should be agent-002`)
    assert(env.allowedRecipients[0] === 'merchant-xyz', `allowedRecipients[0] should be merchantId`)
  })

  await test('AP2 PaymentMandate → SpendEnvelope uses amount + recipientAddress', () => {
    const { address } = freshKeypair()
    const mandate = makePaymentMandate('agent-003', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    assert(env.maxAmount === 165, `maxAmount should be 165, got ${env.maxAmount}`)
    assert(env.allowedRecipients[0] === 'acct_1PXqBBGJhmH2PkST', `allowedRecipients should be recipientAddress`)
  })

  await test('AP2 SpendEnvelope → IntentMandate fields preserved', () => {
    const { address } = freshKeypair()
    const mandate = makeIntentMandate('agent-004', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    const backMandate = spendEnvelopeToAp2Mandate(env, 'intent') as AP2.IntentMandate
    assert(backMandate.type === 'intent', `type should be intent, got ${backMandate.type}`)
    assert(backMandate.maxAmount === env.maxAmount, `maxAmount should match envelope`)
    assert(backMandate.currency === env.currency, `currency should match envelope`)
    assert(backMandate.agentId === env.agent, `agentId should match envelope agent`)
    assert(backMandate.issuerAddress === env.issuer, `issuerAddress should match envelope issuer`)
    assert(typeof backMandate.description === 'string' && backMandate.description.length > 0, 'description should be non-empty string')
    assert(typeof backMandate.expiresAt === 'string', 'expiresAt should be an ISO string')
  })

  await test('AP2 SpendEnvelope → CartMandate fields preserved', () => {
    const { address } = freshKeypair()
    const mandate = makeCartMandate('agent-005', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    const backMandate = spendEnvelopeToAp2Mandate(env, 'cart') as AP2.CartMandate
    assert(backMandate.type === 'cart', `type should be cart, got ${backMandate.type}`)
    assert(backMandate.total === env.maxAmount, `total should match envelope maxAmount`)
    assert(backMandate.currency === env.currency, `currency should match`)
    assert(Array.isArray(backMandate.items) && backMandate.items.length > 0, 'items should be non-empty array')
    assert(backMandate.items[0].currency === env.currency, 'item currency should match envelope')
  })

  await test('AP2 SpendEnvelope → PaymentMandate fields preserved', () => {
    const { address } = freshKeypair()
    const mandate = makePaymentMandate('agent-006', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    const backMandate = spendEnvelopeToAp2Mandate(env, 'payment') as AP2.PaymentMandate
    assert(backMandate.type === 'payment', `type should be payment, got ${backMandate.type}`)
    assert(backMandate.amount === env.maxAmount, `amount should match envelope maxAmount`)
    assert(backMandate.recipientAddress === env.allowedRecipients[0], 'recipientAddress should match allowedRecipients[0]')
    assert(backMandate.currency === env.currency, `currency should match`)
  })

  // =========================================================================
  // AP2 PQ verify
  // =========================================================================

  await test('AP2 PQ verify: sign canonical bytes of mandate, verify passes', () => {
    const { publicKey, secretKey } = freshKeypair()
    const { address } = freshKeypair()
    const mandate = makePaymentMandate('agent-007', address)
    const canonBytes = canonicalJsonBytes(mandate)
    const sig = ml_dsa65.sign(canonBytes, secretKey)
    const pqSig = bytesToHex(sig)
    const pqPub = bytesToHex(publicKey)
    const verified = verifyAp2WithPqWrapper(mandate, pqSig, pqPub)
    assert(verified.mandateId === mandate.mandateId, 'mandateId should match after verification')
    assert(verified.type === 'payment', 'type should be preserved')
  })

  await test('AP2 PQ verify: tamper one signature byte, verify fails', async () => {
    const { publicKey, secretKey } = freshKeypair()
    const { address } = freshKeypair()
    const mandate = makeIntentMandate('agent-008', address)
    const canonBytes = canonicalJsonBytes(mandate)
    const sig = ml_dsa65.sign(canonBytes, secretKey)
    // Flip a byte in the middle of the signature
    sig[500] = sig[500] ^ 0xff
    const pqSig = bytesToHex(sig)
    const pqPub = bytesToHex(publicKey)
    await assertThrows(
      () => verifyAp2WithPqWrapper(mandate, pqSig, pqPub),
      /verification failed/,
      'tampered sig byte',
    )
  })

  await test('AP2 PQ verify: wrong public key, verify fails', async () => {
    const signer = freshKeypair()
    const wrongKey = freshKeypair()
    const { address } = freshKeypair()
    const mandate = makeCartMandate('agent-009', address)
    const canonBytes = canonicalJsonBytes(mandate)
    const sig = ml_dsa65.sign(canonBytes, signer.secretKey)
    const pqSig = bytesToHex(sig)
    const pqPub = bytesToHex(wrongKey.publicKey) // wrong key
    await assertThrows(
      () => verifyAp2WithPqWrapper(mandate, pqSig, pqPub),
      /verification failed/,
      'wrong public key',
    )
  })

  await test('AP2 PQ verify: wrong signature size throws', async () => {
    const { publicKey } = freshKeypair()
    const { address } = freshKeypair()
    const mandate = makeIntentMandate('agent-010', address)
    // Build a signature that is too short (e.g. 100 bytes instead of 3309)
    const shortSig = bytesToHex(new Uint8Array(100))
    const pqPub = bytesToHex(publicKey)
    await assertThrows(
      () => verifyAp2WithPqWrapper(mandate, shortSig, pqPub),
      /invalid ML-DSA-65 signature length/,
      'wrong sig size',
    )
  })

  // =========================================================================
  // ACP SPT → SpendEnvelope
  // =========================================================================

  await test('ACP: SPT cents conversion — 10000 cents → $100.00 USD', () => {
    const { address } = freshKeypair()
    const spt = makeActiveSpt()
    const env = acpTokenToSpendEnvelope(spt, address)
    assert(env.maxAmount === 100, `maxAmount should be 100.00 USD, got ${env.maxAmount}`)
    assert(env.currency === 'USD', `currency should be USD, got ${env.currency}`)
    assert(env.agent === spt.agentId, `agent should match token agentId`)
    assert(env.issuer === address, `issuer should match provided address`)
    assert(env.allowedRecipients[0] === 'acct_1PXqBBGJhmH2PkST', 'allowedRecipients[0] should be allowedMerchants[0]')
    assert(env.rail === 'stripe', 'rail should be stripe')
    assert(/^[0-9a-f]{32}$/.test(env.nonce), 'nonce should be 32 hex chars')
  })

  await test('ACP: agentId override used when provided', () => {
    const { address } = freshKeypair()
    const spt = makeActiveSpt()
    const env = acpTokenToSpendEnvelope(spt, address, 'override-agent-v2')
    assert(env.agent === 'override-agent-v2', `agent should be override-agent-v2, got ${env.agent}`)
  })

  await test('ACP: deactivated SPT throws', async () => {
    const { address } = freshKeypair()
    const spt = { ...makeActiveSpt(), active: false }
    await assertThrows(
      () => acpTokenToSpendEnvelope(spt, address),
      /deactivated/,
      'deactivated SPT',
    )
  })

  await test('ACP: missing allowedMerchants throws', async () => {
    const { address } = freshKeypair()
    const spt: StripeACP.SharedPaymentToken = {
      ...makeActiveSpt(),
      usageLimits: {
        maxAmountPerTransaction: 10000,
        // allowedMerchants intentionally absent
        expiresAt: '2026-12-31T23:59:59Z',
      },
    }
    await assertThrows(
      () => acpTokenToSpendEnvelope(spt, address),
      /allowedMerchants/,
      'missing allowedMerchants',
    )
  })

  await test('ACP: empty allowedMerchants array throws', async () => {
    const { address } = freshKeypair()
    const spt: StripeACP.SharedPaymentToken = {
      ...makeActiveSpt(),
      usageLimits: {
        maxAmountPerTransaction: 10000,
        allowedMerchants: [], // empty, not missing
        expiresAt: '2026-12-31T23:59:59Z',
      },
    }
    await assertThrows(
      () => acpTokenToSpendEnvelope(spt, address),
      /allowedMerchants/,
      'empty allowedMerchants',
    )
  })

  await test('ACP: round-trip envelope → SPT params with correct cent multiplier', () => {
    const { address } = freshKeypair()
    const spt = makeActiveSpt()
    const env = acpTokenToSpendEnvelope(spt, address)
    const params = spendEnvelopeToAcpToken(env, 'pm_1PXqBBGJhmH2PkSTDemo')
    assert(
      params.usageLimits?.maxAmountPerTransaction === 10000,
      `maxAmountPerTransaction should be 10000 cents, got ${params.usageLimits?.maxAmountPerTransaction}`,
    )
    assert(params.currency === 'USD', `currency should be USD, got ${params.currency}`)
    assert(params.agentId === spt.agentId, `agentId should match token agentId`)
    assert(
      params.usageLimits?.allowedMerchants?.[0] === 'acct_1PXqBBGJhmH2PkST',
      'allowedMerchants[0] should be preserved',
    )
    assert(params.paymentMethod === 'pm_1PXqBBGJhmH2PkSTDemo', 'paymentMethod should match provided ID')
    assert(typeof params.usageLimits?.expiresAt === 'string', 'expiresAt should be an ISO string')
    assert(params.idempotencyKey === env.nonce, 'idempotencyKey should be the envelope nonce')
  })

  await test('ACP: multi-recipient envelope throws (single-merchant constraint)', async () => {
    const { address } = freshKeypair()
    const spt = makeActiveSpt()
    // Patch SPT to have 2 allowed merchants
    const sptMulti = {
      ...spt,
      usageLimits: {
        ...spt.usageLimits,
        allowedMerchants: ['acct_111', 'acct_222'],
      },
    }
    const env = acpTokenToSpendEnvelope(sptMulti, address)
    await assertThrows(
      () => spendEnvelopeToAcpToken(env, 'pm_demo'),
      /single-merchant/,
      'multi-recipient',
    )
  })

  await test('ACP: non-stripe rail logs warning (does not throw)', () => {
    const { address } = freshKeypair()
    const spt = makeActiveSpt()
    const env = acpTokenToSpendEnvelope(spt, address)
    // Manually override rail to wise (not stripe)
    const envWise = { ...env, rail: 'wise' as const }
    const warnings: string[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')) }
    try {
      const params = spendEnvelopeToAcpToken(envWise, 'pm_demo')
      assert(typeof params.paymentMethod === 'string', 'should return params even with wrong rail')
    } finally {
      console.warn = origWarn
    }
    assert(
      warnings.some(w => w.includes('wise')),
      `Expected warning mentioning "wise", got: ${JSON.stringify(warnings)}`,
    )
  })

  // =========================================================================
  // Report
  // =========================================================================

  console.log('')
  console.log(
    `  \x1b[1m${passed + failed} tests · ${passed} passed · ${failed} failed\x1b[0m`,
  )
  if (failed > 0) {
    console.log('')
    console.log('\x1b[31m  Failures:\x1b[0m')
    for (const f of failures) {
      console.log(`    • ${f.name}`)
      console.log(`      \x1b[90m${f.err}\x1b[0m`)
    }
    process.exit(1)
  } else {
    console.log('  \x1b[32mAll adapter guardrails held.\x1b[0m')
    console.log('')
  }
}

run().catch((err) => {
  console.error('\x1b[31mTest runner crashed:\x1b[0m', err)
  process.exit(1)
})
