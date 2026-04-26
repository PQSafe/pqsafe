/**
 * Real-mode env-var path tests.
 *
 * These tests verify that the real-mode code paths in each rail are:
 *   1. Type-safe (TypeScript compilation validates this via tsc --noEmit)
 *   2. Correctly branching on env vars (no actual API calls made)
 *   3. Returning mock: false when env vars are set and mock mode is off
 *
 * These tests do NOT call any real API. They use the same sequential mock-fetch
 * pattern as the existing rail tests, but focus specifically on verifying the
 * env-var-driven real-mode branch is reachable and type-correct.
 */

import { describe, it, expect, afterEach } from 'vitest'
import type { SpendEnvelope } from '../../src/envelope.js'
import type { PaymentRequest } from '../../src/types.js'
import type { UsdcBaseConfig, UsdcBaseTxParams } from '../../src/rails/usdc-base.js'
import type { X402PaymentRequirements } from '../../src/rails/x402.js'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function now() {
  return Math.floor(Date.now() / 1000)
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
// Wise: WISE_SANDBOX_KEY + WISE_PROFILE_ID env var path
// ---------------------------------------------------------------------------

describe('Wise rail — real-mode env-var branch', () => {
  afterEach(() => {
    delete process.env.WISE_API_KEY
    delete process.env.WISE_SANDBOX_KEY
    delete process.env.WISE_PROFILE_ID
    process.env.PQSAFE_MOCK_MODE = '1'
  })

  it('WISE_SANDBOX_KEY env var is accepted directly by the rail (alias path)', async () => {
    const { executePayment } = await import('../../src/rails/wise.js')

    // WISE_SANDBOX_KEY is now a direct alias accepted by getWiseConfig()
    process.env.WISE_SANDBOX_KEY = 'sandbox_demo_key_type_check'
    delete process.env.WISE_API_KEY
    process.env.WISE_ENV = 'sandbox'
    process.env.PQSAFE_MOCK_MODE = '0'

    const envelope: SpendEnvelope = {
      version: 1,
      issuer: 'pq1' + 'a'.repeat(40),
      agent: 'real-mode-path-test',
      maxAmount: 10,
      currency: 'GBP',
      allowedRecipients: ['GB29NWBK60161331926819'],
      validFrom: now() - 60,
      validUntil: now() + 3600,
      nonce: 'realmode' + '00'.repeat(12),
      rail: 'wise',
    }

    const request: PaymentRequest = {
      recipient: 'GB29NWBK60161331926819',
      amount: 1,
      memo: 'real-mode type-check test',
    }

    const mockFetch = buildSequentialMockFetch([
      { status: 200, body: [{ id: 99999, type: 'BUSINESS' }] },
      { status: 200, body: { id: 'quote-real-mode-001', sourceCurrency: 'GBP', targetCurrency: 'GBP' } },
      { status: 200, body: { id: 88001, currency: 'GBP', type: 'iban' } },
      { status: 200, body: { id: 77001, status: 'processing', customerTransactionId: 'tx-real-001' } },
      { status: 200, body: { type: 'BALANCE' } },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      const result = await executePayment(envelope, request)

      // Type assertions — TypeScript validates these at compile time
      expect(result.success).toBe(true)
      expect(result.rail).toBe('wise')
      expect(typeof result.txId).toBe('string')
      expect(result.txId.length).toBeGreaterThan(0)
      // Real mode: mock should be false
      expect(result.meta?.mock).toBe(false)
      expect(result.meta?.env).toBe('sandbox')
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('PQSAFE_MOCK_MODE=0 with WISE_API_KEY set enters real-mode branch', async () => {
    const { executePayment } = await import('../../src/rails/wise.js')

    process.env.WISE_API_KEY = 'test_real_branch_key'
    process.env.WISE_ENV = 'sandbox'
    process.env.PQSAFE_MOCK_MODE = '0'

    const envelope: SpendEnvelope = {
      version: 1,
      issuer: 'pq1' + 'b'.repeat(40),
      agent: 'real-branch-test',
      maxAmount: 10,
      currency: 'USD',
      allowedRecipients: ['GB29NWBK60161331926819'],
      validFrom: now() - 60,
      validUntil: now() + 3600,
      nonce: 'branch01' + '00'.repeat(12),
      rail: 'wise',
    }

    const mockFetch = buildSequentialMockFetch([
      { status: 200, body: [{ id: 11111, type: 'PERSONAL' }] },
      { status: 200, body: { id: 'quote-branch-001', sourceCurrency: 'USD' } },
      { status: 200, body: { id: 22222, currency: 'USD' } },
      { status: 200, body: { id: 33333, status: 'incoming_payment_waiting' } },
      { status: 200, body: { type: 'BALANCE' } },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      const result = await executePayment(envelope, { recipient: 'GB29NWBK60161331926819', amount: 1 })
      // Confirms real-mode branch was entered (not mock)
      expect(result.meta?.mock).toBe(false)
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

// ---------------------------------------------------------------------------
// Stripe: STRIPE_TEST_KEY env var path
// ---------------------------------------------------------------------------

describe('Stripe rail — real-mode env-var branch', () => {
  afterEach(async () => {
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: true })
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_TEST_KEY
    process.env.PQSAFE_MOCK_MODE = '1'
  })

  it('STRIPE_TEST_KEY (mapped to STRIPE_SECRET_KEY) enters real-mode branch', async () => {
    const { setAgentPayConfig } = await import('../../src/config.js')
    const { executePayment } = await import('../../src/rails/stripe.js')

    setAgentPayConfig({ mockMode: false, airwallex: { clientId: 'x', apiKey: 'y', env: 'sandbox' } })

    // STRIPE_TEST_KEY is a direct alias accepted by the rail
    process.env.STRIPE_TEST_KEY = 'sk_test_real_mode_type_check'
    delete process.env.STRIPE_SECRET_KEY
    process.env.PQSAFE_MOCK_MODE = '0'

    const piId = 'pi_real_mode_type_check_001'
    const envelope: SpendEnvelope = {
      version: 1,
      issuer: 'pq1' + 'c'.repeat(40),
      agent: 'stripe-real-mode-test',
      maxAmount: 20,
      currency: 'USD',
      allowedRecipients: [piId],
      validFrom: now() - 60,
      validUntil: now() + 3600,
      nonce: 'stripe01' + '00'.repeat(12),
      rail: 'stripe',
    }

    const request: PaymentRequest = {
      recipient: piId,
      amount: 10,
      memo: 'stripe real-mode type-check',
    }

    const mockFetch = buildSequentialMockFetch([
      {
        status: 200,
        body: { id: piId, status: 'succeeded', amount: 1000, amount_received: 1000, currency: 'usd' },
      },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      const result = await executePayment(envelope, request)

      // Type assertions
      expect(result.success).toBe(true)
      expect(result.rail).toBe('stripe')
      expect(result.txId).toBe(piId)
      // Real mode: mock should be false
      expect(result.meta?.mock).toBe(false)
      expect(result.meta?.env).toBe('test')
      expect(result.meta?.recipientType).toBe('payment_intent')
    } finally {
      globalThis.fetch = origFetch
    }
  })

  it('STRIPE_ENV is "test" by default when sk_test_ key is used', async () => {
    const { setAgentPayConfig } = await import('../../src/config.js')
    const { executePayment } = await import('../../src/rails/stripe.js')

    setAgentPayConfig({ mockMode: false, airwallex: { clientId: 'x', apiKey: 'y', env: 'sandbox' } })
    process.env.STRIPE_SECRET_KEY = 'sk_test_env_default_check'
    process.env.PQSAFE_MOCK_MODE = '0'
    // Note: STRIPE_ENV not set — should default to "test"

    const piId = 'pi_env_default_check'
    const envelope: SpendEnvelope = {
      version: 1,
      issuer: 'pq1' + 'd'.repeat(40),
      agent: 'stripe-env-default',
      maxAmount: 5,
      currency: 'USD',
      allowedRecipients: [piId],
      validFrom: now() - 60,
      validUntil: now() + 3600,
      nonce: 'envtest0' + '00'.repeat(12),
      rail: 'stripe',
    }

    const mockFetch = buildSequentialMockFetch([
      { status: 200, body: { id: piId, status: 'succeeded', amount: 500, amount_received: 500, currency: 'usd' } },
    ])

    const origFetch = globalThis.fetch
    globalThis.fetch = mockFetch as typeof fetch

    try {
      const result = await executePayment(envelope, { recipient: piId, amount: 5 })
      expect(result.meta?.env).toBe('test')
      expect(result.meta?.mock).toBe(false)
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

// ---------------------------------------------------------------------------
// USDC-Base: BASE_NETWORK=sepolia + injected signAndSend path
// ---------------------------------------------------------------------------

describe('USDC-Base rail — real-mode env-var branch', () => {
  afterEach(() => {
    delete process.env.BASE_NETWORK
    process.env.PQSAFE_MOCK_MODE = '1'
  })

  it('BASE_NETWORK=sepolia env var selects Sepolia chain correctly', async () => {
    const { executePayment } = await import('../../src/rails/usdc-base.js')

    process.env.BASE_NETWORK = 'sepolia'
    process.env.PQSAFE_MOCK_MODE = '0'

    const EVM_ADDR = '0x' + 'a'.repeat(40)
    const MOCK_HASH = '0x' + 'b'.repeat(64)

    const envelope: SpendEnvelope = {
      version: 1,
      issuer: 'pq1' + 'e'.repeat(40),
      agent: 'usdc-sepolia-env-test',
      maxAmount: 1,
      currency: 'USDC',
      allowedRecipients: [EVM_ADDR],
      validFrom: now() - 60,
      validUntil: now() + 3600,
      nonce: 'sepoliat' + '00'.repeat(12),
      rail: 'usdc-base',
    }

    const config: UsdcBaseConfig = {
      network: 'sepolia',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      signAndSend: async (_params: UsdcBaseTxParams) => MOCK_HASH,
    }

    const result = await executePayment(envelope, { recipient: EVM_ADDR, amount: 0.01 }, config)

    expect(result.success).toBe(true)
    expect(result.txId).toBe(MOCK_HASH)
    expect(result.meta?.network).toBe('sepolia')
    expect(result.meta?.chainId).toBe(84532)
    expect(result.meta?.usdcContract).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e')
    expect(result.meta?.mock).toBe(false)
  })

  it('signAndSend injection is type-safe — params include to, data, network, chainId, atomicAmount', async () => {
    const { executePayment, toUsdcAtomicUnits } =
      await import('../../src/rails/usdc-base.js')

    process.env.PQSAFE_MOCK_MODE = '0'

    const EVM_ADDR = '0x' + 'c'.repeat(40)
    const EXPECTED_AMOUNT = 0.5
    const EXPECTED_ATOMIC = toUsdcAtomicUnits(EXPECTED_AMOUNT)

    let capturedParams: UsdcBaseTxParams | null = null

    const config: UsdcBaseConfig = {
      network: 'sepolia',
      signAndSend: async (params: UsdcBaseTxParams): Promise<string> => {
        capturedParams = params as UsdcBaseTxParams
        return '0x' + 'd'.repeat(64)
      },
    }

    const envelope: SpendEnvelope = {
      version: 1,
      issuer: 'pq1' + 'f'.repeat(40),
      agent: 'type-safety-test',
      maxAmount: 10,
      currency: 'USDC',
      allowedRecipients: [EVM_ADDR],
      validFrom: now() - 60,
      validUntil: now() + 3600,
      nonce: 'typesafe' + '00'.repeat(12),
      rail: 'usdc-base',
    }

    await executePayment(envelope, { recipient: EVM_ADDR, amount: EXPECTED_AMOUNT }, config)

    // Verify all params were passed correctly (type-safe at compile time)
    expect(capturedParams).not.toBeNull()
    expect(capturedParams!.to).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e')
    expect(capturedParams!.network).toBe('sepolia')
    expect(capturedParams!.chainId).toBe(84532)
    expect(capturedParams!.atomicAmount).toBe(EXPECTED_ATOMIC)
    expect(capturedParams!.amount).toBe(EXPECTED_AMOUNT)
    expect(typeof capturedParams!.data).toBe('string')
    expect(capturedParams!.data).toMatch(/^0xa9059cbb/) // ERC-20 transfer selector
  })
})

// ---------------------------------------------------------------------------
// x402: real-mode path type-safety (probe + sign + retry pattern)
// ---------------------------------------------------------------------------

describe('x402 rail — real-mode env-var path type-safety', () => {
  afterEach(async () => {
    const { setAgentPayConfig } = await import('../../src/config.js')
    setAgentPayConfig({ mockMode: true })
    process.env.PQSAFE_MOCK_MODE = '1'
  })

  it('requestResource → signPayment → retryWithPayment is fully type-safe', async () => {
    const {
      requestResource,
      signPayment,
      retryWithPayment,
    } = await import('../../src/rails/x402.js')

    const MOCK_RECIPIENT = '0x' + 'f'.repeat(40)
    const MOCK_TX_HASH = '0x' + 'e'.repeat(64)
    const X402_URL = 'http://localhost:4402/api/resource'

    const requirements: X402PaymentRequirements = {
      scheme: 'exact',
      network: 'base-sepolia',
      tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      amount: '1000000',
      to: MOCK_RECIPIENT,
      maxTimeoutSeconds: 300,
    }

    const reqHeader = Buffer.from(JSON.stringify(requirements)).toString('base64url')

    // Step 1: mock the 402 response
    let callCount = 0
    const mockFetch: typeof fetch = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      callCount++
      const headers = (init?.headers ?? {}) as Record<string, string>
      const hasPayment = 'X-Payment' in headers

      if (hasPayment) {
        return new Response(JSON.stringify({ data: 'premium', status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ error: 'payment_required' }), {
        status: 402,
        headers: { 'X-Payment-Requirements': reqHeader },
      })
    }

    // requestResource parses 402 into X402ResourceResult
    const resourceResult = await requestResource(X402_URL, { fetchFn: mockFetch })

    expect(resourceResult.status).toBe(402)
    expect(resourceResult.requirements).not.toBeNull()
    // TypeScript ensures requirements has the correct shape
    const req: X402PaymentRequirements = resourceResult.requirements!
    expect(req.scheme).toBe('exact')
    expect(req.to).toBe(MOCK_RECIPIENT)

    // signPayment produces X402PaymentProof — type-checked
    const proof = signPayment(req, MOCK_TX_HASH)
    expect(proof.txHash).toBe(MOCK_TX_HASH)
    expect(proof.to).toBe(MOCK_RECIPIENT)
    expect(typeof proof.header).toBe('string')
    expect(typeof proof.timestamp).toBe('number')

    // retryWithPayment sends X-Payment header and returns resource
    const retryResult = await retryWithPayment(X402_URL, proof, { fetchFn: mockFetch })

    expect(retryResult.status).toBe(200)
    expect(retryResult.body).toContain('premium')
    expect(callCount).toBe(2) // probe + retry
  })
})
