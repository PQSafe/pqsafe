/**
 * selectRail() routing logic tests.
 *
 * Tests that the multi-rail router correctly selects adapters based on
 * recipient format, currency, and amount tier.
 * Run: tsx tests/rails/selectRail.test.ts
 */

import { selectRail, ALL_ADAPTERS, type RailAdapter } from '../../src/rails/index.js'
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

function makeEnvelope(
  currency: string,
  recipients: string[],
  overrides?: Partial<SpendEnvelope>,
): SpendEnvelope {
  const now = Math.floor(Date.now() / 1000)
  return {
    version: 1,
    issuer: 'pq1' + 'e'.repeat(40),
    agent: 'router-agent-v1',
    maxAmount: 1000,
    currency,
    allowedRecipients: recipients,
    validFrom: now - 60,
    validUntil: now + 3600,
    nonce: '99887766' + '00'.repeat(12),
    // rail intentionally NOT set — let selectRail() decide
    ...overrides,
  }
}

function makeRequest(recipient: string, amount: number = 100): PaymentRequest {
  return { recipient, amount, memo: 'routing test' }
}

// ---------------------------------------------------------------------------
// Test: EVM address routes to USDC-Base
// ---------------------------------------------------------------------------

await test('selectRail: EVM address recipient routes to usdc-base', () => {
  const evmAddress = '0x' + 'a'.repeat(40)
  const env = makeEnvelope('USDC', [evmAddress])
  const req = makeRequest(evmAddress, 50)
  const adapter = selectRail(env, req)
  assert(adapter.name === 'usdc-base', `expected usdc-base, got ${adapter.name}`)
})

// ---------------------------------------------------------------------------
// Test: HTTPS URL recipient routes to x402
// ---------------------------------------------------------------------------

await test('selectRail: HTTPS URL recipient routes to x402', () => {
  const url = 'https://api.example.com/premium-endpoint'
  const env = makeEnvelope('USDC', [url])
  const req = makeRequest(url, 1)
  const adapter = selectRail(env, req)
  assert(adapter.name === 'x402', `expected x402, got ${adapter.name}`)
})

// ---------------------------------------------------------------------------
// Test: Stripe invoice ID routes to stripe
// ---------------------------------------------------------------------------

await test('selectRail: Stripe invoice ID (in_xxx) routes to stripe', () => {
  const invoiceId = 'in_test_abc123xyz'
  const env = makeEnvelope('USD', [invoiceId])
  const req = makeRequest(invoiceId, 99)
  const adapter = selectRail(env, req)
  assert(adapter.name === 'stripe', `expected stripe, got ${adapter.name}`)
})

// ---------------------------------------------------------------------------
// Test: Stripe payment intent routes to stripe
// ---------------------------------------------------------------------------

await test('selectRail: Stripe payment intent (pi_xxx) routes to stripe', () => {
  const piId = 'pi_test_payment_intent001'
  const env = makeEnvelope('USD', [piId])
  const req = makeRequest(piId, 49)
  const adapter = selectRail(env, req)
  assert(adapter.name === 'stripe', `expected stripe, got ${adapter.name}`)
})

// ---------------------------------------------------------------------------
// Test: IBAN recipient routes to wise (< $50K)
// ---------------------------------------------------------------------------

await test('selectRail: IBAN recipient routes to wise for amounts < $50K', () => {
  const iban = 'GB29NWBK60161331926819'
  const env = makeEnvelope('GBP', [iban])
  const req = makeRequest(iban, 500)
  const adapter = selectRail(env, req)
  assert(adapter.name === 'wise', `expected wise, got ${adapter.name}`)
})

// ---------------------------------------------------------------------------
// Test: Large amount (>$50K) routes to airwallex
// ---------------------------------------------------------------------------

await test('selectRail: large amount (> $50K) routes to airwallex for bank transfers', () => {
  const iban = 'DE89370400440532013000'
  const env = makeEnvelope('EUR', [iban], { maxAmount: 100_000 })
  const req = makeRequest(iban, 75_000)
  const adapter = selectRail(env, req)
  assert(adapter.name === 'airwallex', `expected airwallex for large amount, got ${adapter.name}`)
})

// ---------------------------------------------------------------------------
// Test: Explicit envelope.rail overrides routing
// ---------------------------------------------------------------------------

await test('selectRail: explicit envelope.rail overrides auto-routing', () => {
  const evmAddress = '0x' + 'b'.repeat(40)
  // EVM address would normally route to usdc-base, but envelope says airwallex
  const env = makeEnvelope('USD', [evmAddress], { rail: 'airwallex' })
  const req = makeRequest(evmAddress, 100)
  const adapter = selectRail(env, req)
  assert(adapter.name === 'airwallex', `explicit rail should be airwallex, got ${adapter.name}`)
})

// ---------------------------------------------------------------------------
// Test: RailAdapter.supports() coverage
// ---------------------------------------------------------------------------

await test('RailAdapter.supports(): each adapter returns correct coverage', () => {
  const adapters = ALL_ADAPTERS

  // usdc-base: supports USDC + EVM address
  const usdcAdapter = adapters.find((a) => a.name === 'usdc-base')!
  assert(usdcAdapter.supports('USDC', '0x' + 'a'.repeat(40)), 'usdc-base should support USDC+EVM')
  assert(!usdcAdapter.supports('USD', '0x' + 'a'.repeat(40)), 'usdc-base should NOT support USD')
  assert(!usdcAdapter.supports('USDC', 'GB29NWBK60161331926819'), 'usdc-base should NOT support IBAN')

  // stripe: supports USD + Stripe IDs
  const stripeAdap = adapters.find((a) => a.name === 'stripe')!
  assert(stripeAdap.supports('USD', 'in_test_001'), 'stripe should support USD+invoice')
  assert(!stripeAdap.supports('USDC', 'in_test_001'), 'stripe should NOT support USDC')
  assert(!stripeAdap.supports('USD', 'GB29NWBK60161331926819'), 'stripe should NOT support IBAN')

  // wise: supports USD + IBAN
  const wiseAdap = adapters.find((a) => a.name === 'wise')!
  assert(wiseAdap.supports('USD', 'GB29NWBK60161331926819'), 'wise should support USD+IBAN')
  assert(!wiseAdap.supports('USDC', 'GB29NWBK60161331926819'), 'wise should NOT support USDC')

  // x402: supports USDC + URL
  const x402Adap = adapters.find((a) => a.name === 'x402')!
  assert(x402Adap.supports('USDC', 'https://api.example.com/resource'), 'x402 should support USDC+URL')
  assert(!x402Adap.supports('USD', 'https://api.example.com/resource'), 'x402 should NOT support USD')
})

// ---------------------------------------------------------------------------
// Test: estimateCost returns valid cost structure
// ---------------------------------------------------------------------------

await test('RailAdapter.estimateCost(): all adapters return valid cost structure', () => {
  for (const adapter of ALL_ADAPTERS) {
    const cost = adapter.estimateCost(100, 'USD')
    assert(typeof cost.rail_fee === 'number', `${adapter.name}: rail_fee should be a number`)
    assert(cost.rail_fee >= 0, `${adapter.name}: rail_fee should be non-negative, got ${cost.rail_fee}`)
    assert(typeof cost.currency === 'string', `${adapter.name}: currency should be a string`)
  }

  // Verify ordering: x402 < usdc-base < wise < stripe < airwallex for $100
  const x402 = ALL_ADAPTERS.find((a) => a.name === 'x402')!
  const stripe = ALL_ADAPTERS.find((a) => a.name === 'stripe')!
  const wise = ALL_ADAPTERS.find((a) => a.name === 'wise')!
  assert(
    x402.estimateCost(100, 'USDC').rail_fee < stripe.estimateCost(100, 'USD').rail_fee,
    'x402 should be cheaper than stripe for $100',
  )
  assert(
    wise.estimateCost(100, 'USD').rail_fee < stripe.estimateCost(100, 'USD').rail_fee,
    'wise should be cheaper than stripe for $100',
  )
})

// ---------------------------------------------------------------------------
// Test: estimateLatency ordering
// ---------------------------------------------------------------------------

await test('RailAdapter.estimateLatency(): crypto rails faster than fiat rails', () => {
  const usdcBase = ALL_ADAPTERS.find((a) => a.name === 'usdc-base')!
  const x402 = ALL_ADAPTERS.find((a) => a.name === 'x402')!
  const wise = ALL_ADAPTERS.find((a) => a.name === 'wise')!
  const airwallex = ALL_ADAPTERS.find((a) => a.name === 'airwallex')!

  assert(usdcBase.estimateLatency() < wise.estimateLatency(), 'USDC-Base faster than Wise')
  assert(x402.estimateLatency() < wise.estimateLatency(), 'x402 faster than Wise')
  assert(wise.estimateLatency() < airwallex.estimateLatency(), 'Wise faster than Airwallex')

  // All latencies are positive
  for (const adapter of ALL_ADAPTERS) {
    assert(adapter.estimateLatency() > 0, `${adapter.name}: latency should be positive`)
  }
})

// ---------------------------------------------------------------------------
// Test: Crypto currency with non-EVM recipient throws
// ---------------------------------------------------------------------------

await test('selectRail: USDC with IBAN recipient throws helpful error', async () => {
  const iban = 'GB29NWBK60161331926819'
  const env = makeEnvelope('USDC', [iban])
  const req = makeRequest(iban, 100)
  await assertThrows(
    () => Promise.resolve(selectRail(env, req)),
    /requires an EVM address/,
    'USDC with IBAN',
  )
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('')
console.log('\x1b[35m\x1b[1m  PQSafe AgentPay — selectRail() routing suite\x1b[0m')
console.log(`\n  \x1b[1m${passed + failed} tests · ${passed} passed · ${failed} failed\x1b[0m`)
if (failed > 0) {
  console.log('\n\x1b[31m  Failures:\x1b[0m')
  for (const f of failures) {
    console.log(`    • ${f.name}\n      \x1b[90m${f.err}\x1b[0m`)
  }
  process.exit(1)
} else {
  console.log('  \x1b[32mAll selectRail routing tests passed.\x1b[0m\n')
}
