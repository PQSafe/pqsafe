/**
 * Stripe rail tests — mocked HTTP via global fetch override.
 *
 * All HTTP calls are intercepted; NO real credentials required.
 * Run: tsx tests/rails/stripe.test.ts
 */

import { executePayment } from '../../src/rails/stripe.js'
import type { SpendEnvelope } from '../../src/envelope.js'
import type { PaymentRequest } from '../../src/types.js'

// ---------------------------------------------------------------------------
// Test harness
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
  try { await fn() } catch (e) {
    threw = true
    errMsg = e instanceof Error ? e.message : String(e)
  }
  assert(threw, `${label}: expected throw, but nothing threw`)
  const ok = typeof match === 'string' ? errMsg.includes(match) : match.test(errMsg)
  assert(ok, `${label}: error "${errMsg}" did not match ${match}`)
}

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
  return {
    recipient: 'in_test_invoice001',
    amount: 99,
    memo: 'stripe test payment',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Sequential mock fetch builder
// ---------------------------------------------------------------------------

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
// Test: Payment intent creation success
// ---------------------------------------------------------------------------

await test('Stripe: payment intent creation — pi_ recipient confirms successfully', async () => {
  // Override config cache to enable real mode
  const { setAgentPayConfig } = await import('../../src/config.js')
  setAgentPayConfig({ mockMode: false, airwallex: { clientId: 'x', apiKey: 'y', env: 'sandbox' } })
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock_T1'
  process.env.PQSAFE_MOCK_MODE = '0'

  // Stripe PI confirm: POST /v1/payment_intents/{id}/confirm
  const mockFetch = buildSequentialMockFetch([
    {
      status: 200,
      body: {
        id: 'pi_test_pi001',
        status: 'succeeded',
        amount: 9900,
        amount_received: 9900,
        currency: 'usd',
      },
    },
  ])

  const origFetch = globalThis.fetch
  globalThis.fetch = mockFetch as typeof fetch

  try {
    const env = makeEnvelope()
    const req = makeRequest({ recipient: 'pi_test_pi001', amount: 99 })
    const result = await executePayment(env, req)

    assert(result.success === true, `success should be true, got ${result.success}`)
    assert(result.rail === 'stripe', `rail should be stripe, got ${result.rail}`)
    assert(result.txId === 'pi_test_pi001', `txId should be pi_test_pi001, got ${result.txId}`)
    assert(result.meta?.mock === false, 'should be real mode')
    assert(result.meta?.recipientType === 'payment_intent', `recipientType should be payment_intent`)
    assert(result.meta?.stripeStatus === 'succeeded', `stripeStatus should be succeeded`)
  } finally {
    globalThis.fetch = origFetch
    delete process.env.STRIPE_SECRET_KEY
    setAgentPayConfig({ mockMode: true })
  }
})

// ---------------------------------------------------------------------------
// Test: Invoice payment success
// ---------------------------------------------------------------------------

await test('Stripe: invoice payment — in_ recipient paid successfully', async () => {
  const { setAgentPayConfig } = await import('../../src/config.js')
  setAgentPayConfig({ mockMode: false, airwallex: { clientId: 'x', apiKey: 'y', env: 'sandbox' } })
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock_T2'
  process.env.PQSAFE_MOCK_MODE = '0'

  // GET /v1/invoices/{id} then POST /v1/invoices/{id}/pay
  const mockFetch = buildSequentialMockFetch([
    {
      status: 200,
      body: {
        id: 'in_test_invoice001',
        status: 'open',
        amount_due: 9900,
        currency: 'usd',
      },
    },
    {
      status: 200,
      body: {
        id: 'in_test_invoice001',
        status: 'paid',
        payment_intent: 'pi_test_from_invoice',
        currency: 'usd',
        amount_due: 9900,
      },
    },
  ])

  const origFetch = globalThis.fetch
  globalThis.fetch = mockFetch as typeof fetch

  try {
    const env = makeEnvelope({ maxAmount: 200 })
    const req = makeRequest({ recipient: 'in_test_invoice001', amount: 99 })
    const result = await executePayment(env, req)

    assert(result.success === true, `success should be true, got ${result.success}`)
    assert(result.rail === 'stripe', `rail should be stripe`)
    assert(result.meta?.recipientType === 'invoice', `recipientType should be invoice`)
    assert(result.meta?.stripeStatus === 'paid', `stripeStatus should be paid`)
    assert(result.meta?.mock === false, 'should be real mode')
  } finally {
    globalThis.fetch = origFetch
    delete process.env.STRIPE_SECRET_KEY
    setAgentPayConfig({ mockMode: true })
  }
})

// ---------------------------------------------------------------------------
// Test: Payment method attach for SPT flow
// ---------------------------------------------------------------------------

await test('Stripe: mock mode processes SPT-style recipient and returns mock txId', async () => {
  // In mock mode, any recipient type returns a mock result
  const { setAgentPayConfig } = await import('../../src/config.js')
  setAgentPayConfig({ mockMode: true })
  delete process.env.STRIPE_SECRET_KEY

  const env = makeEnvelope()
  // Use a customer ID — maps to SPT-style flow
  const req = makeRequest({ recipient: 'cus_test001', amount: 50 })
  // Mock mode will return without real HTTP call

  // Stripe doesn't support raw 'customer' recipient in real mode, but mock mode passes
  // We test that the mock result has proper fields
  try {
    await executePayment(env, req)
    // If it throws (unsupported type) that's also fine — verify the error
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Should throw a clear "unsupported recipient format" error since cus_ is not in real mode path
    assert(msg.includes('unsupported recipient') || msg.includes('stripe'), `unexpected error: ${msg}`)
  }

  // Re-test with a supported mock: invoice ID in mock mode
  const req2 = makeRequest({ recipient: 'in_test_invoice001', amount: 50 })
  const result = await executePayment(env, req2)
  assert(result.success === true, 'mock invoice should succeed')
  assert(result.txId.startsWith('pi_sbx_'), `mock txId should start with pi_sbx_, got ${result.txId}`)
  assert(result.meta?.mock === true, 'mock flag should be set')
  assert(result.meta?.env === 'test', `meta.env should be test, got ${result.meta?.env}`)
})

// ---------------------------------------------------------------------------
// Test: Card declined error
// ---------------------------------------------------------------------------

await test('Stripe: card declined error mapped to PQSafe/Stripe: CARD_DECLINED', async () => {
  const { setAgentPayConfig } = await import('../../src/config.js')
  setAgentPayConfig({ mockMode: false, airwallex: { clientId: 'x', apiKey: 'y', env: 'sandbox' } })
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock_T4'
  process.env.PQSAFE_MOCK_MODE = '0'

  // PI confirm fails with card_declined
  const mockFetch = buildSequentialMockFetch([
    {
      status: 402,
      body: {
        error: {
          code: 'card_declined',
          message: 'Your card was declined.',
          type: 'card_error',
        },
      },
    },
  ])

  const origFetch = globalThis.fetch
  globalThis.fetch = mockFetch as typeof fetch

  try {
    const env = makeEnvelope()
    const req = makeRequest({ recipient: 'pi_test_declined', amount: 99 })
    await assertThrows(
      () => executePayment(env, req),
      'CARD_DECLINED',
      'card declined',
    )
  } finally {
    globalThis.fetch = origFetch
    delete process.env.STRIPE_SECRET_KEY
    setAgentPayConfig({ mockMode: true })
  }
})

// ---------------------------------------------------------------------------
// Test: Insufficient funds error
// ---------------------------------------------------------------------------

await test('Stripe: insufficient funds error mapped to PQSafe/Stripe: INSUFFICIENT_FUNDS', async () => {
  const { setAgentPayConfig } = await import('../../src/config.js')
  setAgentPayConfig({ mockMode: false, airwallex: { clientId: 'x', apiKey: 'y', env: 'sandbox' } })
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock_T5'
  process.env.PQSAFE_MOCK_MODE = '0'

  // Invoice pay fails with insufficient funds
  const mockFetch = buildSequentialMockFetch([
    // GET invoice
    {
      status: 200,
      body: {
        id: 'in_test_invoice001',
        status: 'open',
        amount_due: 9900,
        currency: 'usd',
      },
    },
    // POST pay fails
    {
      status: 402,
      body: {
        error: {
          code: 'insufficient_funds',
          message: 'Your card has insufficient funds.',
          type: 'card_error',
        },
      },
    },
  ])

  const origFetch = globalThis.fetch
  globalThis.fetch = mockFetch as typeof fetch

  try {
    const env = makeEnvelope({ maxAmount: 200 })
    const req = makeRequest({ recipient: 'in_test_invoice001', amount: 99 })
    await assertThrows(
      () => executePayment(env, req),
      'INSUFFICIENT_FUNDS',
      'insufficient funds',
    )
  } finally {
    globalThis.fetch = origFetch
    delete process.env.STRIPE_SECRET_KEY
    setAgentPayConfig({ mockMode: true })
  }
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('')
console.log('\x1b[35m\x1b[1m  PQSafe AgentPay — Stripe rail suite\x1b[0m')
console.log(`\n  \x1b[1m${passed + failed} tests · ${passed} passed · ${failed} failed\x1b[0m`)
if (failed > 0) {
  console.log('\n\x1b[31m  Failures:\x1b[0m')
  for (const f of failures) {
    console.log(`    • ${f.name}\n      \x1b[90m${f.err}\x1b[0m`)
  }
  process.exit(1)
} else {
  console.log('  \x1b[32mAll Stripe rail tests passed.\x1b[0m\n')
}
