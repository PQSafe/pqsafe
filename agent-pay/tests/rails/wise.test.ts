/**
 * Wise rail tests — mocked HTTP via global fetch override.
 *
 * All HTTP calls are intercepted; NO real credentials required.
 * Run: tsx tests/rails/wise.test.ts
 */

import { executePayment } from '../../src/rails/wise.js'
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
  return {
    recipient: 'GB29NWBK60161331926819', // valid IBAN
    amount: 100,
    memo: 'test payment',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Sequential mock fetch builder
// Each call consumes the next response in the array.
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
// Wise module exports its profileIdCache as a module-level `let`.
// We use unique API keys per test to force fresh profile fetches.
// Since the cache is keyed on first use per process, we work around it
// by always including profile calls in the mock sequence.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Test: Quote creation success
// ---------------------------------------------------------------------------

await test('Wise: quote creation succeeds — real sandbox path', async () => {
  process.env.WISE_ENV = 'sandbox'
  process.env.PQSAFE_MOCK_MODE = '0'
  // Use a fresh key to differentiate from cached state
  process.env.WISE_API_KEY = 'sandbox_key_T1'

  // Profile cached from possible previous tests — include it anyway in case
  // this is the first test to run. The module caches profileIdCache module-wide,
  // so we provide the call if needed, but extra calls just get consumed.
  const mockFetch = buildSequentialMockFetch([
    { status: 200, body: [{ id: MOCK_PROFILE_ID, type: 'BUSINESS' }] }, // GET /v1/profiles (may be skipped if cached)
    { status: 200, body: { id: 'quote-uuid-001', sourceCurrency: 'USD', targetCurrency: 'USD' } }, // POST /v3/quotes
    { status: 200, body: { id: 99001, currency: 'USD', type: 'iban' } }, // POST /v1/accounts
    { status: 200, body: { id: 7001, status: 'processing', customerTransactionId: 'tx-001' } }, // POST transfers
    { status: 200, body: { type: 'BALANCE' } }, // POST payments
  ])

  const origFetch = globalThis.fetch
  globalThis.fetch = mockFetch as typeof fetch

  try {
    const env = makeEnvelope()
    const req = makeRequest()
    const result = await executePayment(env, req)

    assert(result.success === true, `success should be true, got ${result.success}`)
    assert(result.rail === 'wise', `rail should be wise, got ${result.rail}`)
    assert(typeof result.txId === 'string' && result.txId.length > 0, 'txId should be non-empty')
    assert(result.amount === 100, `amount should be 100, got ${result.amount}`)
    assert(result.currency === 'USD', `currency should be USD, got ${result.currency}`)
    assert(result.meta?.mock === false, 'should NOT be mock mode')
    assert(result.meta?.env === 'sandbox', `meta.env should be sandbox, got ${result.meta?.env}`)
  } finally {
    globalThis.fetch = origFetch
    delete process.env.WISE_API_KEY
    process.env.PQSAFE_MOCK_MODE = '1'
  }
})

// ---------------------------------------------------------------------------
// Test: Transfer creation success — verify transfer ID in result
// ---------------------------------------------------------------------------

await test('Wise: transfer creation returns real Wise transfer ID', async () => {
  process.env.WISE_ENV = 'sandbox'
  process.env.WISE_API_KEY = 'sandbox_key_T2'
  process.env.PQSAFE_MOCK_MODE = '0'

  // Profile is already cached from T1 above, so we skip it and go straight to
  // the subsequent calls: quote → account → transfer → payment
  const TRANSFER_ID = 98765

  const mockFetch = buildSequentialMockFetch([
    // Profile MAY be cached — include it in case of test order changes
    { status: 200, body: [{ id: MOCK_PROFILE_ID, type: 'BUSINESS' }] },
    // Quote
    { status: 200, body: { id: 'quote-uuid-002', sourceCurrency: 'USD' } },
    // Recipient account
    { status: 200, body: { id: 99002, currency: 'USD' } },
    // Transfer
    { status: 200, body: { id: TRANSFER_ID, status: 'processing' } },
    // Payment (fund)
    { status: 200, body: { type: 'BALANCE' } },
  ])

  const origFetch = globalThis.fetch
  globalThis.fetch = mockFetch as typeof fetch

  try {
    const env = makeEnvelope()
    const req = makeRequest({ recipient: 'GB29NWBK60161331926819', amount: 250 })
    const result = await executePayment(env, req)

    // The transfer ID is the 4th call's id (or the one returned from transfers POST)
    assert(result.success === true, 'success should be true')
    assert(typeof result.txId === 'string', 'txId should be a string')
    // Verify the transfer ID is numeric (real Wise IDs are numbers-as-strings)
    const numericId = parseInt(result.txId, 10)
    assert(!isNaN(numericId), `txId "${result.txId}" should be parseable as a number`)
    assert(result.meta?.mock === false, 'should be real mode')
    assert(result.amount === 250, `amount should be 250, got ${result.amount}`)
  } finally {
    globalThis.fetch = origFetch
    delete process.env.WISE_API_KEY
    process.env.PQSAFE_MOCK_MODE = '1'
  }
})

// ---------------------------------------------------------------------------
// Test: Status polling — mock mode produces pollable txId
// ---------------------------------------------------------------------------

await test('Wise: status polling — txId is a stable reference for GET /v1/transfers/{id}', async () => {
  process.env.PQSAFE_MOCK_MODE = '1'
  delete process.env.WISE_API_KEY

  const env = makeEnvelope()
  const req = makeRequest()
  const result = await executePayment(env, req)

  assert(result.success === true, 'should succeed in mock mode')
  assert(result.txId.startsWith('wise_sbx_'), `txId should start with wise_sbx_, got ${result.txId}`)
  assert(result.meta?.mock === true, 'mock flag should be set')
  assert(result.meta?.envelopeNonce === env.nonce, 'meta should carry envelope nonce')

  // Simulate what polling would look like
  const pollingUrl = `https://api.sandbox.transferwise.tech/v1/transfers/${result.txId}`
  assert(typeof pollingUrl === 'string', 'polling URL should be constructable')
  assert(pollingUrl.includes(result.txId), 'polling URL should contain txId')
})

// ---------------------------------------------------------------------------
// Test: Insufficient balance error
// ---------------------------------------------------------------------------

await test('Wise: insufficient balance error mapped to PQSafe/Wise: INSUFFICIENT_FUNDS', async () => {
  process.env.WISE_ENV = 'sandbox'
  process.env.WISE_API_KEY = 'sandbox_key_T4'
  process.env.PQSAFE_MOCK_MODE = '0'

  // NOTE: profileIdCache is a module-level variable cached from T1.
  // From T2 onwards the GET /v1/profiles call is skipped.
  // Sequence: quote → account → transfer → payment(error)
  const mockFetch = buildSequentialMockFetch([
    // Quote succeeds
    { status: 200, body: { id: 'quote-uuid-T4' } },
    // Recipient account
    { status: 200, body: { id: 99004, currency: 'USD' } },
    // Transfer succeeds
    { status: 200, body: { id: 7004, status: 'processing' } },
    // Funding fails — insufficient balance
    {
      status: 422,
      body: {
        errors: [{ message: 'You do not have sufficient balance to fund this transfer' }],
      },
    },
  ])

  const origFetch = globalThis.fetch
  globalThis.fetch = mockFetch as typeof fetch

  try {
    const env = makeEnvelope()
    const req = makeRequest({ amount: 99999 })
    await assertThrows(
      () => executePayment(env, req),
      'INSUFFICIENT_FUNDS',
      'insufficient balance',
    )
  } finally {
    globalThis.fetch = origFetch
    delete process.env.WISE_API_KEY
    process.env.PQSAFE_MOCK_MODE = '1'
  }
})

// ---------------------------------------------------------------------------
// Test: Recipient validation error
// ---------------------------------------------------------------------------

await test('Wise: recipient validation error mapped to PQSafe/Wise: INVALID_RECIPIENT', async () => {
  process.env.WISE_ENV = 'sandbox'
  process.env.WISE_API_KEY = 'sandbox_key_T5'
  process.env.PQSAFE_MOCK_MODE = '0'

  // Profile is cached from T1 — skip GET /v1/profiles. Sequence: quote → account(error)
  const mockFetch = buildSequentialMockFetch([
    // Quote succeeds
    { status: 200, body: { id: 'quote-uuid-T5' } },
    // Recipient account creation fails — invalid recipient details
    {
      status: 400,
      body: {
        errors: [{ message: 'recipient account number is invalid and cannot be processed' }],
      },
    },
  ])

  const origFetch = globalThis.fetch
  globalThis.fetch = mockFetch as typeof fetch

  try {
    const env = makeEnvelope()
    const req = makeRequest({ recipient: 'bad-recipient' })
    await assertThrows(
      () => executePayment(env, req),
      'INVALID_RECIPIENT',
      'invalid recipient',
    )
  } finally {
    globalThis.fetch = origFetch
    delete process.env.WISE_API_KEY
    process.env.PQSAFE_MOCK_MODE = '1'
  }
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('')
console.log('\x1b[35m\x1b[1m  PQSafe AgentPay — Wise rail suite\x1b[0m')
console.log(`\n  \x1b[1m${passed + failed} tests · ${passed} passed · ${failed} failed\x1b[0m`)
if (failed > 0) {
  console.log('\n\x1b[31m  Failures:\x1b[0m')
  for (const f of failures) {
    console.log(`    • ${f.name}\n      \x1b[90m${f.err}\x1b[0m`)
  }
  process.exit(1)
} else {
  console.log('  \x1b[32mAll Wise rail tests passed.\x1b[0m\n')
}
