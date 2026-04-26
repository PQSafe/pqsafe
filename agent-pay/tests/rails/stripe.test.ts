/**
 * Stripe rail tests — mocked HTTP via global fetch override (Vitest)
 */

import { describe, it, expect, afterEach } from 'vitest'
import { executePayment } from '../../src/rails/stripe.js'
import type { SpendEnvelope } from '../../src/envelope.js'
import type { PaymentRequest } from '../../src/types.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEnvelope(overrides?: Partial<SpendEnvelope>): SpendEnvelope {
  const now = Math.floor(Date.now() / 1000)
  return {
    version: 1,
    issuer: 'pq1' + 'b'.repeat(40),
    agent: 'stripe-agent-v1',
    maxAmount: 500,
    currency: 'USD',
    allowedRecipients: ['in_test_invoice001', 'pi_test_pi001', 'cus_test001'],
    validFrom: now - 60,
    validUntil: now + 3600,
    nonce: 'cafebabe' + '00'.repeat(12),
    rail: 'stripe',
    ...overrides,
  }
}

function makeRequest(overrides?: Partial<PaymentRequest>): PaymentRequest {
  return { recipient: 'in_test_invoice001', amount: 99, memo: 'stripe test payment', ...overrides }
}

function buildSequentialMockFetch(calls: Array<{ status: number; body: unknown }>): typeof fetch {
  let idx = 0
  return async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const spec = idx < calls.length ? calls[idx] : calls[calls.length - 1]
    idx++
    return new Response(JSON.stringify(spec.body), {
      status: spec.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stripe rail', () => {
  afterEach(async () => {
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: true })
    delete process.env.STRIPE_SECRET_KEY
    process.env.PQSAFE_MOCK_MODE = '1'
  })

  it('payment intent creation — pi_ recipient confirms successfully', async () => {
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: false, airwallex: { clientId: 'x', apiKey: 'y', env: 'sandbox' } })
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_T1'
    process.env.PQSAFE_MOCK_MODE = '0'

    const mockFetch = buildSequentialMockFetch([
      {
        status: 200,
        body: { id: 'pi_test_pi001', status: 'succeeded', amount: 9900, amount_received: 9900, currency: 'usd' },
      },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      const result = await executePayment(makeEnvelope(), makeRequest({ recipient: 'pi_test_pi001', amount: 99 }))
      expect(result.success).toBe(true)
      expect(result.rail).toBe('stripe')
      expect(result.txId).toBe('pi_test_pi001')
      expect(result.meta?.mock).toBe(false)
      expect(result.meta?.recipientType).toBe('payment_intent')
      expect(result.meta?.stripeStatus).toBe('succeeded')
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('invoice payment — in_ recipient paid successfully', async () => {
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: false, airwallex: { clientId: 'x', apiKey: 'y', env: 'sandbox' } })
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_T2'
    process.env.PQSAFE_MOCK_MODE = '0'

    const mockFetch = buildSequentialMockFetch([
      { status: 200, body: { id: 'in_test_invoice001', status: 'open', amount_due: 9900, currency: 'usd' } },
      {
        status: 200,
        body: { id: 'in_test_invoice001', status: 'paid', payment_intent: 'pi_test_from_invoice', currency: 'usd', amount_due: 9900 },
      },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      const result = await executePayment(
        makeEnvelope({ maxAmount: 200 }),
        makeRequest({ recipient: 'in_test_invoice001', amount: 99 }),
      )
      expect(result.success).toBe(true)
      expect(result.rail).toBe('stripe')
      expect(result.meta?.recipientType).toBe('invoice')
      expect(result.meta?.stripeStatus).toBe('paid')
      expect(result.meta?.mock).toBe(false)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('mock mode processes invoice ID and returns mock txId', async () => {
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: true })
    delete process.env.STRIPE_SECRET_KEY

    const req = makeRequest({ recipient: 'in_test_invoice001', amount: 50 })
    const result = await executePayment(makeEnvelope(), req)
    expect(result.success).toBe(true)
    expect(result.txId).toMatch(/^pi_sbx_/)
    expect(result.meta?.mock).toBe(true)
    expect(result.meta?.env).toBe('test')
  })

  it('card declined error mapped to CARD_DECLINED', async () => {
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: false, airwallex: { clientId: 'x', apiKey: 'y', env: 'sandbox' } })
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_T4'
    process.env.PQSAFE_MOCK_MODE = '0'

    const mockFetch = buildSequentialMockFetch([
      {
        status: 402,
        body: { error: { code: 'card_declined', message: 'Your card was declined.', type: 'card_error' } },
      },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      await expect(
        executePayment(makeEnvelope(), makeRequest({ recipient: 'pi_test_declined', amount: 99 })),
      ).rejects.toThrow('CARD_DECLINED')
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('insufficient funds error mapped to INSUFFICIENT_FUNDS', async () => {
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: false, airwallex: { clientId: 'x', apiKey: 'y', env: 'sandbox' } })
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_T5'
    process.env.PQSAFE_MOCK_MODE = '0'

    const mockFetch = buildSequentialMockFetch([
      { status: 200, body: { id: 'in_test_invoice001', status: 'open', amount_due: 9900, currency: 'usd' } },
      {
        status: 402,
        body: { error: { code: 'insufficient_funds', message: 'Your card has insufficient funds.', type: 'card_error' } },
      },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      await expect(
        executePayment(
          makeEnvelope({ maxAmount: 200 }),
          makeRequest({ recipient: 'in_test_invoice001', amount: 99 }),
        ),
      ).rejects.toThrow('INSUFFICIENT_FUNDS')
    } finally {
      globalThis.fetch = origFetch
    }
  })
})
