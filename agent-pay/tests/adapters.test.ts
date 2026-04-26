/**
 * PQSafe AgentPay — AP2 + ACP adapter test suite (Vitest)
 *
 * 20 test cases covering AP2 mandate ↔ SpendEnvelope round-trips,
 * AP2 PQ verify, ACP SPT → SpendEnvelope conversion, and guardrails.
 */

import { describe, it, expect } from 'vitest'
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
// Fixtures
// ---------------------------------------------------------------------------

function freshKeypair() {
  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const address = 'pq1' + bytesToHex(keccak_256(publicKey).slice(0, 20))
  return { publicKey, secretKey, address }
}

const NOW_ISO = new Date(Date.now() + 3600_000).toISOString()

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
      maxAmountPerTransaction: 10000,
      allowedMerchants: ['acct_1PXqBBGJhmH2PkST'],
      expiresAt: '2026-12-31T23:59:59Z',
      currency: 'USD',
    },
  }
}

// ---------------------------------------------------------------------------
// AP2 → SpendEnvelope → AP2 round-trips
// ---------------------------------------------------------------------------

describe('AP2 mandate → SpendEnvelope round-trips', () => {
  it('IntentMandate → SpendEnvelope preserves amount, currency, agent', () => {
    const { address } = freshKeypair()
    const mandate = makeIntentMandate('agent-001', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    expect(env.maxAmount).toBe(150)
    expect(env.currency).toBe('USD')
    expect(env.agent).toBe('agent-001')
    expect(env.issuer).toBe(address)
    expect(env.allowedRecipients[0]).toBe('merchant-xyz')
    expect(env.nonce).toMatch(/^[0-9a-f]{32}$/)
    expect(env.version).toBe(1)
  })

  it('CartMandate → SpendEnvelope uses total as maxAmount', () => {
    const { address } = freshKeypair()
    const mandate = makeCartMandate('agent-002', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    expect(env.maxAmount).toBe(165)
    expect(env.currency).toBe('USD')
    expect(env.agent).toBe('agent-002')
    expect(env.allowedRecipients[0]).toBe('merchant-xyz')
  })

  it('PaymentMandate → SpendEnvelope uses amount + recipientAddress', () => {
    const { address } = freshKeypair()
    const mandate = makePaymentMandate('agent-003', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    expect(env.maxAmount).toBe(165)
    expect(env.allowedRecipients[0]).toBe('acct_1PXqBBGJhmH2PkST')
  })

  it('SpendEnvelope → IntentMandate fields preserved', () => {
    const { address } = freshKeypair()
    const mandate = makeIntentMandate('agent-004', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    const backMandate = spendEnvelopeToAp2Mandate(env, 'intent') as AP2.IntentMandate
    expect(backMandate.type).toBe('intent')
    expect(backMandate.maxAmount).toBe(env.maxAmount)
    expect(backMandate.currency).toBe(env.currency)
    expect(backMandate.agentId).toBe(env.agent)
    expect(backMandate.issuerAddress).toBe(env.issuer)
    expect(typeof backMandate.description).toBe('string')
    expect(backMandate.description.length).toBeGreaterThan(0)
    expect(typeof backMandate.expiresAt).toBe('string')
  })

  it('SpendEnvelope → CartMandate fields preserved', () => {
    const { address } = freshKeypair()
    const mandate = makeCartMandate('agent-005', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    const backMandate = spendEnvelopeToAp2Mandate(env, 'cart') as AP2.CartMandate
    expect(backMandate.type).toBe('cart')
    expect(backMandate.total).toBe(env.maxAmount)
    expect(backMandate.currency).toBe(env.currency)
    expect(Array.isArray(backMandate.items)).toBe(true)
    expect(backMandate.items.length).toBeGreaterThan(0)
    expect(backMandate.items[0].currency).toBe(env.currency)
  })

  it('SpendEnvelope → PaymentMandate fields preserved', () => {
    const { address } = freshKeypair()
    const mandate = makePaymentMandate('agent-006', address)
    const env = ap2MandateToSpendEnvelope(mandate, address, 3600)
    const backMandate = spendEnvelopeToAp2Mandate(env, 'payment') as AP2.PaymentMandate
    expect(backMandate.type).toBe('payment')
    expect(backMandate.amount).toBe(env.maxAmount)
    expect(backMandate.recipientAddress).toBe(env.allowedRecipients[0])
    expect(backMandate.currency).toBe(env.currency)
  })
})

// ---------------------------------------------------------------------------
// AP2 PQ verify
// ---------------------------------------------------------------------------

describe('AP2 PQ verify', () => {
  it('sign canonical bytes of mandate, verify passes', () => {
    const { publicKey, secretKey } = freshKeypair()
    const { address } = freshKeypair()
    const mandate = makePaymentMandate('agent-007', address)
    const canonBytes = canonicalJsonBytes(mandate)
    const sig = ml_dsa65.sign(canonBytes, secretKey)
    const pqSig = bytesToHex(sig)
    const pqPub = bytesToHex(publicKey)
    const verified = verifyAp2WithPqWrapper(mandate, pqSig, pqPub)
    expect(verified.mandateId).toBe(mandate.mandateId)
    expect(verified.type).toBe('payment')
  })

  it('tamper one signature byte, verify fails', async () => {
    const { publicKey, secretKey } = freshKeypair()
    const { address } = freshKeypair()
    const mandate = makeIntentMandate('agent-008', address)
    const canonBytes = canonicalJsonBytes(mandate)
    const sig = ml_dsa65.sign(canonBytes, secretKey)
    sig[500] = sig[500] ^ 0xff
    const pqSig = bytesToHex(sig)
    const pqPub = bytesToHex(publicKey)
    expect(() => verifyAp2WithPqWrapper(mandate, pqSig, pqPub)).toThrow(/verification failed/)
  })

  it('wrong public key, verify fails', async () => {
    const signer = freshKeypair()
    const wrongKey = freshKeypair()
    const { address } = freshKeypair()
    const mandate = makeCartMandate('agent-009', address)
    const canonBytes = canonicalJsonBytes(mandate)
    const sig = ml_dsa65.sign(canonBytes, signer.secretKey)
    const pqSig = bytesToHex(sig)
    const pqPub = bytesToHex(wrongKey.publicKey)
    expect(() => verifyAp2WithPqWrapper(mandate, pqSig, pqPub)).toThrow(/verification failed/)
  })

  it('wrong signature size throws', async () => {
    const { publicKey } = freshKeypair()
    const { address } = freshKeypair()
    const mandate = makeIntentMandate('agent-010', address)
    const shortSig = bytesToHex(new Uint8Array(100))
    const pqPub = bytesToHex(publicKey)
    expect(() => verifyAp2WithPqWrapper(mandate, shortSig, pqPub)).toThrow(
      /invalid ML-DSA-65 signature length/,
    )
  })
})

// ---------------------------------------------------------------------------
// ACP SPT → SpendEnvelope
// ---------------------------------------------------------------------------

describe('ACP SPT → SpendEnvelope', () => {
  it('cents conversion — 10000 cents → $100.00 USD', () => {
    const { address } = freshKeypair()
    const spt = makeActiveSpt()
    const env = acpTokenToSpendEnvelope(spt, address)
    expect(env.maxAmount).toBe(100)
    expect(env.currency).toBe('USD')
    expect(env.agent).toBe(spt.agentId)
    expect(env.issuer).toBe(address)
    expect(env.allowedRecipients[0]).toBe('acct_1PXqBBGJhmH2PkST')
    expect(env.rail).toBe('stripe')
    expect(env.nonce).toMatch(/^[0-9a-f]{32}$/)
  })

  it('agentId override used when provided', () => {
    const { address } = freshKeypair()
    const spt = makeActiveSpt()
    const env = acpTokenToSpendEnvelope(spt, address, 'override-agent-v2')
    expect(env.agent).toBe('override-agent-v2')
  })

  it('deactivated SPT throws', async () => {
    const { address } = freshKeypair()
    const spt = { ...makeActiveSpt(), active: false }
    expect(() => acpTokenToSpendEnvelope(spt, address)).toThrow(/deactivated/)
  })

  it('missing allowedMerchants throws', async () => {
    const { address } = freshKeypair()
    const spt: StripeACP.SharedPaymentToken = {
      ...makeActiveSpt(),
      usageLimits: {
        maxAmountPerTransaction: 10000,
        expiresAt: '2026-12-31T23:59:59Z',
      },
    }
    expect(() => acpTokenToSpendEnvelope(spt, address)).toThrow(/allowedMerchants/)
  })

  it('empty allowedMerchants array throws', async () => {
    const { address } = freshKeypair()
    const spt: StripeACP.SharedPaymentToken = {
      ...makeActiveSpt(),
      usageLimits: {
        maxAmountPerTransaction: 10000,
        allowedMerchants: [],
        expiresAt: '2026-12-31T23:59:59Z',
      },
    }
    expect(() => acpTokenToSpendEnvelope(spt, address)).toThrow(/allowedMerchants/)
  })

  it('round-trip envelope → SPT params with correct cent multiplier', () => {
    const { address } = freshKeypair()
    const spt = makeActiveSpt()
    const env = acpTokenToSpendEnvelope(spt, address)
    const params = spendEnvelopeToAcpToken(env, 'pm_1PXqBBGJhmH2PkSTDemo')
    expect(params.usageLimits?.maxAmountPerTransaction).toBe(10000)
    expect(params.currency).toBe('USD')
    expect(params.agentId).toBe(spt.agentId)
    expect(params.usageLimits?.allowedMerchants?.[0]).toBe('acct_1PXqBBGJhmH2PkST')
    expect(params.paymentMethod).toBe('pm_1PXqBBGJhmH2PkSTDemo')
    expect(typeof params.usageLimits?.expiresAt).toBe('string')
    expect(params.idempotencyKey).toBe(env.nonce)
  })

  it('multi-recipient envelope throws (single-merchant constraint)', async () => {
    const { address } = freshKeypair()
    const spt = makeActiveSpt()
    const sptMulti = {
      ...spt,
      usageLimits: { ...spt.usageLimits, allowedMerchants: ['acct_111', 'acct_222'] },
    }
    const env = acpTokenToSpendEnvelope(sptMulti, address)
    expect(() => spendEnvelopeToAcpToken(env, 'pm_demo')).toThrow(/single-merchant/)
  })

  it('non-stripe rail logs warning (does not throw)', () => {
    const { address } = freshKeypair()
    const spt = makeActiveSpt()
    const env = acpTokenToSpendEnvelope(spt, address)
    const envWise = { ...env, rail: 'wise' as const }
    const warnings: string[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')) }
    try {
      const params = spendEnvelopeToAcpToken(envWise, 'pm_demo')
      expect(typeof params.paymentMethod).toBe('string')
    } finally {
      console.warn = origWarn
    }
    expect(warnings.some(w => w.includes('wise'))).toBe(true)
  })
})
