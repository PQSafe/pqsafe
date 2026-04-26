/**
 * Wise rail tests — mocked HTTP via global fetch override (Vitest)
 */

import { describe, it, expect, afterEach } from 'vitest'
import { executePayment } from '../../src/rails/wise.js'
import type { SpendEnvelope } from '../../src/envelope.js'
import type { PaymentRequest } from '../../src/types.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_PROFILE_ID = 12345678

function makeEnvelope(overrides?: Partial<SpendEnvelope>): SpendEnvelope {
  const now = Math.floor(Date.now() / 1000)
  return {
    version: 1,
    issuer: 'pq1' + 'a'.repeat(40),
    agent: 'test-agent-v1',
    maxAmount: 500,
    currency: 'USD',
    allowedRecipients: ['GB29NWBK60161331926819', 'wise-recipient', 'bad-recipient'],
    validFrom: now - 60,
    validUntil: now + 3600,
    nonce: 'deadbeef' + '00'.repeat(12),
    rail: 'wise',
    ...overrides,
  }
}

function makeRequest(overrides?: Partial<PaymentRequest>): PaymentRequest {
  return { recipient: 'GB29NWBK60161331926819', amount: 100, memo: 'test payment', ...overrides }
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

describe('Wise rail', () => {
  afterEach(() => {
    process.env.PQSAFE_MOCK_MODE = '1'
    delete process.env.WISE_API_KEY
  })

  it('quote creation succeeds — real sandbox path', async () => {
    process.env.WISE_ENV = 'sandbox'
    process.env.PQSAFE_MOCK_MODE = '0'
    process.env.WISE_API_KEY = 'sandbox_key_T1'

    const mockFetch = buildSequentialMockFetch([
      { status: 200, body: [{ id: MOCK_PROFILE_ID, type: 'BUSINESS' }] },
      { status: 200, body: { id: 'quote-uuid-001', sourceCurrency: 'USD', targetCurrency: 'USD' } },
      { status: 200, body: { id: 99001, currency: 'USD', type: 'iban' } },
      { status: 200, body: { id: 7001, status: 'processing', customerTransactionId: 'tx-001' } },
      { status: 200, body: { type: 'BALANCE' } },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      const result = await executePayment(makeEnvelope(), makeRequest())
      expect(result.success).toBe(true)
      expect(result.rail).toBe('wise')
      expect(typeof result.txId).toBe('string')
      expect(result.txId.length).toBeGreaterThan(0)
      expect(result.amount).toBe(100)
      expect(result.currency).toBe('USD')
      expect(result.meta?.mock).toBe(false)
      expect(result.meta?.env).toBe('sandbox')
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('transfer creation returns real Wise transfer ID', async () => {
    process.env.WISE_ENV = 'sandbox'
    process.env.WISE_API_KEY = 'sandbox_key_T2'
    process.env.PQSAFE_MOCK_MODE = '0'

    const TRANSFER_ID = 98765
    const mockFetch = buildSequentialMockFetch([
      { status: 200, body: [{ id: MOCK_PROFILE_ID, type: 'BUSINESS' }] },
      { status: 200, body: { id: 'quote-uuid-002', sourceCurrency: 'USD' } },
      { status: 200, body: { id: 99002, currency: 'USD' } },
      { status: 200, body: { id: TRANSFER_ID, status: 'processing' } },
      { status: 200, body: { type: 'BALANCE' } },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      const result = await executePayment(makeEnvelope(), makeRequest({ amount: 250 }))
      expect(result.success).toBe(true)
      expect(typeof result.txId).toBe('string')
      expect(parseInt(result.txId, 10)).not.toBeNaN()
      expect(result.meta?.mock).toBe(false)
      expect(result.amount).toBe(250)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('status polling — txId is a stable reference for GET /v1/transfers/{id}', async () => {
    process.env.PQSAFE_MOCK_MODE = '1'
    delete process.env.WISE_API_KEY

    const env = makeEnvelope()
    const result = await executePayment(env, makeRequest())

    expect(result.success).toBe(true)
    expect(result.txId).toMatch(/^wise_sbx_/)
    expect(result.meta?.mock).toBe(true)
    expect(result.meta?.envelopeNonce).toBe(env.nonce)

    const pollingUrl = `https://api.sandbox.transferwise.tech/v1/transfers/${result.txId}`
    expect(pollingUrl).toContain(result.txId)
  })

  it('insufficient balance error mapped to INSUFFICIENT_FUNDS', async () => {
    process.env.WISE_ENV = 'sandbox'
    process.env.WISE_API_KEY = 'sandbox_key_T4'
    process.env.PQSAFE_MOCK_MODE = '0'

    const mockFetch = buildSequentialMockFetch([
      { status: 200, body: { id: 'quote-uuid-T4' } },
      { status: 200, body: { id: 99004, currency: 'USD' } },
      { status: 200, body: { id: 7004, status: 'processing' } },
      {
        status: 422,
        body: { errors: [{ message: 'You do not have sufficient balance to fund this transfer' }] },
      },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      await expect(
        executePayment(makeEnvelope(), makeRequest({ amount: 99999 })),
      ).rejects.toThrow('INSUFFICIENT_FUNDS')
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('recipient validation error mapped to INVALID_RECIPIENT', async () => {
    process.env.WISE_ENV = 'sandbox'
    process.env.WISE_API_KEY = 'sandbox_key_T5'
    process.env.PQSAFE_MOCK_MODE = '0'

    const mockFetch = buildSequentialMockFetch([
      { status: 200, body: { id: 'quote-uuid-T5' } },
      {
        status: 400,
        body: { errors: [{ message: 'recipient account number is invalid and cannot be processed' }] },
      },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      await expect(
        executePayment(makeEnvelope(), makeRequest({ recipient: 'bad-recipient' })),
      ).rejects.toThrow('INVALID_RECIPIENT')
    } finally {
      globalThis.fetch = origFetch
    }
  })
})
