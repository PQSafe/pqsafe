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
})
