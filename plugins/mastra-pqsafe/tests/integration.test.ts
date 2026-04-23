/**
 * Integration tests for @pqsafe/mastra
 *
 * Run: npx vitest run
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { createPQSafeIntegration, SignedEnvelope, PaymentRequest } from '../src/index.js'

const STUB_ENVELOPE: SignedEnvelope = {
  envelopeJson: JSON.stringify({ version: 1, issuer: 'pq1' + 'a'.repeat(40) }),
  signature: 'deadbeef',
  dsaPublicKey: 'cafebabe',
}

const STUB_REQUEST: PaymentRequest = {
  recipient: 'GB29NWBK60161331926819',
  amount: 150,
  memo: 'Invoice #42',
}

describe('createPQSafeIntegration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an integration object with a pay() method', () => {
    const pqsafe = createPQSafeIntegration()
    expect(typeof pqsafe.pay).toBe('function')
  })

  it('pay() resolves with txId, status, rail on 200 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ txId: 'tx_mastra_001', status: 'settled', rail: 'wise' }),
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const pqsafe = createPQSafeIntegration({ apiUrl: 'https://api.pqsafe.xyz/v1' })
    const result = await pqsafe.pay(STUB_ENVELOPE, STUB_REQUEST)

    expect(result.txId).toBe('tx_mastra_001')
    expect(result.status).toBe('settled')
    expect(result.rail).toBe('wise')
  })

  it('pay() POSTs to /pay with correct body shape', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ txId: 'tx_001', status: 'pending', rail: 'stripe' }),
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const pqsafe = createPQSafeIntegration({ apiUrl: 'https://test.example.com/v1' })
    await pqsafe.pay(STUB_ENVELOPE, STUB_REQUEST)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://test.example.com/v1/pay')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body as string)
    expect(body.signedEnvelope).toEqual(STUB_ENVELOPE)
    expect(body.request.recipient).toBe(STUB_REQUEST.recipient)
    expect(body.request.amount).toBe(STUB_REQUEST.amount)
  })

  it('pay() throws on non-2xx HTTP response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'Envelope expired',
    } as unknown as Response)
    vi.stubGlobal('fetch', mockFetch)

    const pqsafe = createPQSafeIntegration()
    await expect(pqsafe.pay(STUB_ENVELOPE, STUB_REQUEST)).rejects.toThrow(
      'HTTP 422',
    )
  })

  it('pay() respects custom apiUrl (no trailing slash)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ txId: 'tx_x', status: 'ok', rail: 'usdc-base' }),
    } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const pqsafe = createPQSafeIntegration({ apiUrl: 'https://custom.api.io/v2/' })
    await pqsafe.pay(STUB_ENVELOPE, STUB_REQUEST)

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://custom.api.io/v2/pay') // trailing slash stripped
  })
})
