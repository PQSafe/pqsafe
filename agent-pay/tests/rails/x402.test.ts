/**
 * x402 rail tests — mock x402 server via fetch override.
 *
 * Tests the full x402 handshake: requestResource → signPayment → retryWithPayment.
 * Run: tsx tests/rails/x402.test.ts
 */

import {
  executePayment,
  requestResource,
  signPayment,
  retryWithPayment,
  probeX402Endpoint,
  type X402PaymentRequirements,
} from '../../src/rails/x402.js'
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
// Mock x402 server — simulates the x402 protocol handshake
// ---------------------------------------------------------------------------

const MOCK_RECIPIENT = '0x' + 'f'.repeat(40)
const MOCK_TX_HASH = '0x' + 'e'.repeat(64)
const X402_URL = 'https://mock-x402-server.pqsafe.xyz/api/resource'

/** Build a base64url-encoded payment requirements header (as spec'd by x402.org) */
function buildPaymentRequirementsHeader(req: X402PaymentRequirements): string {
  const json = JSON.stringify(req)
  // atob/btoa available in Node 16+ / global
  const base64 = Buffer.from(json).toString('base64url')
  return base64
}

const MOCK_REQUIREMENTS: X402PaymentRequirements = {
  scheme: 'exact',
  network: 'base-sepolia',
  tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  amount: '1000000', // 1 USDC in atomic units
  to: MOCK_RECIPIENT,
  maxTimeoutSeconds: 300,
}

/** A mock fetch that behaves like an x402 server:
 *  - First call: returns 402 + X-Payment-Requirements
 *  - Second call (with X-Payment header): returns 200 + body
 */
function buildX402MockFetch(opts?: {
  resourceBody?: string
  rejectPayment?: boolean
}): typeof fetch {
  let callCount = 0
  const resourceBody = opts?.resourceBody ?? '{"data":"premium_content","status":"ok"}'
  const rejectPayment = opts?.rejectPayment ?? false

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    callCount++
    const headers = (init?.headers as Record<string, string>) ?? {}
    const hasPaymentHeader = 'X-Payment' in headers || 'x-payment' in headers

    if (hasPaymentHeader && !rejectPayment) {
      // Caller included payment — serve the resource
      return new Response(resourceBody, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (rejectPayment && hasPaymentHeader) {
      return new Response(JSON.stringify({ error: 'payment_invalid' }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // No payment header — return 402 with requirements
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
// Test: requestResource → 402 + payment requirements
// ---------------------------------------------------------------------------

await test('x402: requestResource receives 402 and parses X-Payment-Requirements', async () => {
  const mockFetch = buildX402MockFetch()
  const result = await requestResource(X402_URL, { fetchFn: mockFetch as typeof fetch })

  assert(result.status === 402, `status should be 402, got ${result.status}`)
  assert(result.requirements !== null, 'requirements should be parsed')
  assert(result.requirements!.to === MOCK_RECIPIENT, `to should be ${MOCK_RECIPIENT}`)
  assert(result.requirements!.scheme === 'exact', `scheme should be exact`)
  assert(result.requirements!.amount === '1000000', `amount should be 1000000`)
  assert(result.requirements!.network === 'base-sepolia', 'network should be base-sepolia')
  assert(result.body === null, 'body should be null on 402')
})

// ---------------------------------------------------------------------------
// Test: signPayment produces valid X-Payment header
// ---------------------------------------------------------------------------

await test('x402: signPayment produces a valid base64url payment proof', () => {
  const proof = signPayment(MOCK_REQUIREMENTS, MOCK_TX_HASH)

  assert(typeof proof.header === 'string' && proof.header.length > 0, 'header should be non-empty')
  assert(proof.txHash === MOCK_TX_HASH, `txHash should be ${MOCK_TX_HASH}`)
  assert(proof.to === MOCK_RECIPIENT, `to should be ${MOCK_RECIPIENT}`)
  assert(proof.amount === '1000000', `amount should be 1000000`)
  assert(typeof proof.timestamp === 'number' && proof.timestamp > 0, 'timestamp should be positive')

  // Verify the header is valid base64url JSON
  const decoded = Buffer.from(proof.header, 'base64url').toString('utf8')
  const parsed = JSON.parse(decoded)
  assert(parsed.txHash === MOCK_TX_HASH, 'decoded txHash should match')
  assert(parsed.scheme === 'exact', 'decoded scheme should be exact')
})

// ---------------------------------------------------------------------------
// Test: retryWithPayment → 200 + resource body
// ---------------------------------------------------------------------------

await test('x402: retryWithPayment re-GETs URL with X-Payment header and receives 200', async () => {
  const mockFetch = buildX402MockFetch({ resourceBody: '{"premium":"data"}' })
  const proof = signPayment(MOCK_REQUIREMENTS, MOCK_TX_HASH)
  const result = await retryWithPayment(X402_URL, proof, { fetchFn: mockFetch as typeof fetch })

  assert(result.status === 200, `status should be 200, got ${result.status}`)
  assert(result.body.includes('premium'), `body should contain resource data, got ${result.body}`)
})

// ---------------------------------------------------------------------------
// Test: Full end-to-end x402 handshake via mock server
// ---------------------------------------------------------------------------

await test('x402: full handshake — requestResource → signPayment → retryWithPayment', async () => {
  const mockFetch = buildX402MockFetch({ resourceBody: '{"access":"granted","tier":"premium"}' })
  const fetchFn = mockFetch as typeof fetch

  // Step 1: probe
  const resourceResult = await requestResource(X402_URL, { fetchFn })
  assert(resourceResult.status === 402, 'step 1: should get 402')
  assert(resourceResult.requirements !== null, 'step 1: should have requirements')

  // Step 2: sign
  const proof = signPayment(resourceResult.requirements!, MOCK_TX_HASH)
  assert(typeof proof.header === 'string', 'step 2: proof header should be a string')

  // Step 3: retry
  const finalResult = await retryWithPayment(X402_URL, proof, { fetchFn })
  assert(finalResult.status === 200, `step 3: final status should be 200, got ${finalResult.status}`)
  assert(finalResult.body.includes('granted'), `step 3: body should contain "granted", got ${finalResult.body}`)
})

// ---------------------------------------------------------------------------
// Test: x402 mock mode via executePayment
// ---------------------------------------------------------------------------

await test('x402: executePayment mock mode simulates handshake without real network', async () => {
  process.env.PQSAFE_MOCK_MODE = '1'
  const { setAgentPayConfig } = await import('../../src/config.js')
  setAgentPayConfig({ mockMode: true })

  const env = makeEnvelope()
  const req: PaymentRequest = {
    recipient: X402_URL,
    amount: 1,
    memo: 'x402 test',
  }

  const result = await executePayment(env, req)

  assert(result.success === true, 'mock should succeed')
  assert(result.rail === 'x402', `rail should be x402, got ${result.rail}`)
  assert(result.txId.startsWith('x402_sbx_'), `txId should start with x402_sbx_, got ${result.txId}`)
  assert(result.meta?.mock === true, 'mock flag should be set')
  assert(result.meta?.protocol === 'x402', 'meta.protocol should be x402')
  assert(typeof result.meta?.onChainTxHash === 'string', 'meta.onChainTxHash should be a string')
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('')
console.log('\x1b[35m\x1b[1m  PQSafe AgentPay — x402 rail suite\x1b[0m')
console.log(`\n  \x1b[1m${passed + failed} tests · ${passed} passed · ${failed} failed\x1b[0m`)
if (failed > 0) {
  console.log('\n\x1b[31m  Failures:\x1b[0m')
  for (const f of failures) {
    console.log(`    • ${f.name}\n      \x1b[90m${f.err}\x1b[0m`)
  }
  process.exit(1)
} else {
  console.log('  \x1b[32mAll x402 rail tests passed.\x1b[0m\n')
}
