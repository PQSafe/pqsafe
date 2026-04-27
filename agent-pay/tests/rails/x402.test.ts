/**
 * x402 rail tests — mock x402 server via fetch override (Vitest)
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  executePayment,
  requestResource,
  signPayment,
  retryWithPayment,
  type X402PaymentRequirements,
} from '../../src/rails/x402.js'
import type { SpendEnvelope } from '../../src/envelope.js'
import type { PaymentRequest } from '../../src/types.js'

// ---------------------------------------------------------------------------
// Mock x402 server
// ---------------------------------------------------------------------------

const MOCK_RECIPIENT = '0x' + 'f'.repeat(40)
const MOCK_TX_HASH = '0x' + 'e'.repeat(64)
const X402_URL = 'https://mock-x402-server.pqsafe.xyz/api/resource'

function buildPaymentRequirementsHeader(req: X402PaymentRequirements): string {
  const json = JSON.stringify(req)
  return Buffer.from(json).toString('base64url')
}

const MOCK_REQUIREMENTS: X402PaymentRequirements = {
  scheme: 'exact',
  network: 'base-sepolia',
  tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  amount: '1000000',
  to: MOCK_RECIPIENT,
  maxTimeoutSeconds: 300,
}

function buildX402MockFetch(opts?: { resourceBody?: string; rejectPayment?: boolean }): typeof fetch {
  const resourceBody = opts?.resourceBody ?? '{"data":"premium_content","status":"ok"}'
  const rejectPayment = opts?.rejectPayment ?? false

  return async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = (init?.headers as Record<string, string>) ?? {}
    const hasPaymentHeader = 'X-Payment' in headers || 'x-payment' in headers

    if (hasPaymentHeader && !rejectPayment) {
      return new Response(resourceBody, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (rejectPayment && hasPaymentHeader) {
      return new Response(JSON.stringify({ error: 'payment_invalid' }), { status: 402 })
    }

    const requirementsHeader = buildPaymentRequirementsHeader(MOCK_REQUIREMENTS)
    return new Response(JSON.stringify({ error: 'payment_required' }), {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Requirements': requirementsHeader,
      },
    })
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEnvelope(overrides?: Partial<SpendEnvelope>): SpendEnvelope {
  const now = Math.floor(Date.now() / 1000)
  return {
    version: 1,
    issuer: 'pq1' + 'd'.repeat(40),
    agent: 'x402-agent-v1',
    maxAmount: 5,
    currency: 'USDC',
    allowedRecipients: [MOCK_RECIPIENT, X402_URL],
    validFrom: now - 60,
    validUntil: now + 3600,
    nonce: 'aabb1122' + '00'.repeat(12),
    rail: 'x402',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('x402 rail', () => {
  afterEach(async () => {
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: true })
    process.env.PQSAFE_MOCK_MODE = '1'
  })

  it('requestResource receives 402 and parses X-Payment-Requirements', async () => {
    const mockFetch = buildX402MockFetch()
    const result = await requestResource(X402_URL, { fetchFn: mockFetch as typeof fetch })

    expect(result.status).toBe(402)
    expect(result.requirements).not.toBeNull()
    expect(result.requirements!.to).toBe(MOCK_RECIPIENT)
    expect(result.requirements!.scheme).toBe('exact')
    expect(result.requirements!.amount).toBe('1000000')
    expect(result.requirements!.network).toBe('base-sepolia')
    expect(result.body).toBeNull()
  })

  it('signPayment produces a valid base64url payment proof', () => {
    const proof = signPayment(MOCK_REQUIREMENTS, MOCK_TX_HASH)

    expect(typeof proof.header).toBe('string')
    expect(proof.header.length).toBeGreaterThan(0)
    expect(proof.txHash).toBe(MOCK_TX_HASH)
    expect(proof.to).toBe(MOCK_RECIPIENT)
    expect(proof.amount).toBe('1000000')
    expect(proof.timestamp).toBeGreaterThan(0)

    const decoded = Buffer.from(proof.header, 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded)
    expect(parsed.txHash).toBe(MOCK_TX_HASH)
    expect(parsed.scheme).toBe('exact')
  })

  it('retryWithPayment re-GETs URL with X-Payment header and receives 200', async () => {
    const mockFetch = buildX402MockFetch({ resourceBody: '{"premium":"data"}' })
    const proof = signPayment(MOCK_REQUIREMENTS, MOCK_TX_HASH)
    const result = await retryWithPayment(X402_URL, proof, { fetchFn: mockFetch as typeof fetch })

    expect(result.status).toBe(200)
    expect(result.body).toContain('premium')
  })

  it('full handshake — requestResource → signPayment → retryWithPayment', async () => {
    const mockFetch = buildX402MockFetch({ resourceBody: '{"access":"granted","tier":"premium"}' })
    const fetchFn = mockFetch as typeof fetch

    const resourceResult = await requestResource(X402_URL, { fetchFn })
    expect(resourceResult.status).toBe(402)
    expect(resourceResult.requirements).not.toBeNull()

    const proof = signPayment(resourceResult.requirements!, MOCK_TX_HASH)
    expect(typeof proof.header).toBe('string')

    const finalResult = await retryWithPayment(X402_URL, proof, { fetchFn })
    expect(finalResult.status).toBe(200)
    expect(finalResult.body).toContain('granted')
  })

  it('executePayment mock mode simulates handshake without real network', async () => {
    process.env.PQSAFE_MOCK_MODE = '1'
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: true })

    const env = makeEnvelope()
    const req: PaymentRequest = { recipient: X402_URL, amount: 1, memo: 'x402 test' }
    const result = await executePayment(env, req)

    expect(result.success).toBe(true)
    expect(result.rail).toBe('x402')
    expect(result.txId).toMatch(/^x402_sbx_/)
    expect(result.meta?.mock).toBe(true)
    expect(result.meta?.protocol).toBe('x402')
    expect(typeof result.meta?.onChainTxHash).toBe('string')
  })

  it('requestResource returns status=200 body directly when server responds 200 (no payment needed)', async () => {
    // Cover line 298: server responds 200 immediately
    const immediateOkFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response('{"free":"content"}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const result = await requestResource(X402_URL, { fetchFn: immediateOkFetch as typeof fetch })
    expect(result.status).toBe(200)
    expect(result.body).toContain('free')
    expect(result.requirements).toBeNull()
  })

  it('requestResource returns non-402 status passthrough (e.g. 500)', async () => {
    // Cover line 302: server responds with non-200, non-402 status
    const serverErrorFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response('Internal Server Error', { status: 500 })
    }
    const result = await requestResource(X402_URL, { fetchFn: serverErrorFetch as typeof fetch })
    expect(result.status).toBe(500)
    expect(result.requirements).toBeNull()
    expect(result.body).toBeNull()
  })

  it('requestResource throws when 402 has no X-Payment-Requirements header', async () => {
    // Cover line 308: missing header on 402
    const missingHeaderFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response('payment required', { status: 402 })
    }
    await expect(requestResource(X402_URL, { fetchFn: missingHeaderFetch as typeof fetch }))
      .rejects.toThrow('X-Payment-Requirements')
  })

  it('retryWithPayment throws when server rejects payment (non-ok response)', async () => {
    // Cover line 369: payment rejected by server
    const rejectFetch = buildX402MockFetch({ rejectPayment: true })
    const proof = signPayment(MOCK_REQUIREMENTS, MOCK_TX_HASH)
    await expect(
      retryWithPayment(X402_URL, proof, { fetchFn: rejectFetch as typeof fetch })
    ).rejects.toThrow('payment rejected')
  })

  it('executePayment real-mode throws with helpful message (no signer injected)', async () => {
    // Cover lines 206-230: real-mode path in executePayment
    process.env.PQSAFE_MOCK_MODE = ''
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: false })

    const mockFetch = buildX402MockFetch() as typeof fetch
    const env = makeEnvelope()
    const req: PaymentRequest = { recipient: X402_URL, amount: 1, memo: 'x402 real-mode test' }

    await expect(executePayment(env, req, { fetchFn: mockFetch })).rejects.toThrow(
      /real-mode|usdcBaseSigner|PQSAFE_MOCK_MODE/i
    )

    // Restore mock mode for subsequent tests
    setAgentPayConfig({ mockMode: true })
    process.env.PQSAFE_MOCK_MODE = '1'
  })

  it('executePayment real-mode throws when recipient not in envelope allowlist', async () => {
    // Cover line 207: recipient not in allowedRecipients
    process.env.PQSAFE_MOCK_MODE = ''
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: false })

    const badRecipient = '0x' + 'bad'.repeat(13) + 'b'
    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      const reqHeader = Buffer.from(JSON.stringify({
        ...MOCK_REQUIREMENTS,
        to: badRecipient,
      })).toString('base64url')
      return new Response('{}', { status: 402, headers: { 'X-Payment-Requirements': reqHeader } })
    }

    const env = makeEnvelope() // allowedRecipients = [MOCK_RECIPIENT, X402_URL]
    const req: PaymentRequest = { recipient: X402_URL, amount: 1, memo: 'disallowed recipient test' }

    await expect(executePayment(env, req, { fetchFn: mockFetch as typeof fetch })).rejects.toThrow(
      /allowlist|not in/i
    )

    setAgentPayConfig({ mockMode: true })
    process.env.PQSAFE_MOCK_MODE = '1'
  })

  it('probeX402Endpoint returns requirements when server responds 402 with header', async () => {
    // Cover lines 232-246: probeX402Endpoint
    const { probeX402Endpoint } = await import('../../src/rails/x402.js')
    const mockFetch = buildX402MockFetch() as typeof fetch
    const result = await probeX402Endpoint(X402_URL, mockFetch)
    expect(result).not.toBeNull()
    expect(result?.to).toBe(MOCK_RECIPIENT)
  })

  it('probeX402Endpoint returns null when server responds 200 (no x402 support)', async () => {
    const { probeX402Endpoint } = await import('../../src/rails/x402.js')
    const okFetch = async (_: RequestInfo | URL): Promise<Response> => new Response('ok', { status: 200 })
    const result = await probeX402Endpoint(X402_URL, okFetch as typeof fetch)
    expect(result).toBeNull()
  })

  it('probeX402Endpoint returns null when fetch throws', async () => {
    const { probeX402Endpoint } = await import('../../src/rails/x402.js')
    const throwFetch = async (_: RequestInfo | URL): Promise<Response> => { throw new Error('network error') }
    const result = await probeX402Endpoint(X402_URL, throwFetch as typeof fetch)
    expect(result).toBeNull()
  })
})
