/**
 * USDC-Base rail tests — no real credentials required.
 *
 * Tests use injected signAndSend stubs to simulate signing.
 * Run: tsx tests/rails/usdc_base.test.ts
 */

import {
  executePayment,
  encodeTransferCalldata,
  toUsdcAtomicUnits,
  type UsdcBaseConfig,
} from '../../src/rails/usdc-base.js'
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

const EVM_RECIPIENT = '0x' + 'a'.repeat(40) // valid EVM address
const MOCK_TX_HASH = '0x' + 'b'.repeat(64) // valid tx hash

function makeEnvelope(overrides?: Partial<SpendEnvelope>): SpendEnvelope {
  const now = Math.floor(Date.now() / 1000)
  return {
    version: 1,
    issuer: 'pq1' + 'c'.repeat(40),
    agent: 'usdc-agent-v1',
    maxAmount: 1000,
    currency: 'USDC',
    allowedRecipients: [EVM_RECIPIENT],
    validFrom: now - 60,
    validUntil: now + 3600,
    nonce: '11223344' + '00'.repeat(12),
    rail: 'usdc-base',
    ...overrides,
  }
}

function makeRequest(overrides?: Partial<PaymentRequest>): PaymentRequest {
  return {
    recipient: EVM_RECIPIENT,
    amount: 10.5,
    memo: 'usdc test transfer',
    ...overrides,
  }
}

/** A stub signAndSend that returns a valid tx hash */
function makeStubSigner(returnHash: string = MOCK_TX_HASH): UsdcBaseConfig['signAndSend'] {
  return async (_params) => returnHash
}

// ---------------------------------------------------------------------------
// Test: createTransfer builds correct calldata
// ---------------------------------------------------------------------------

await test('USDC-Base: encodeTransferCalldata produces valid 68-byte calldata', () => {
  const calldata = encodeTransferCalldata(EVM_RECIPIENT, 10_500_000n)

  assert(calldata.startsWith('0x'), 'calldata should start with 0x')
  const bytes = (calldata.length - 2) / 2
  assert(bytes === 68, `calldata should be 68 bytes, got ${bytes}`)

  // Selector for transfer(address,uint256): 0xa9059cbb
  assert(calldata.startsWith('0xa9059cbb'), `selector should be 0xa9059cbb, got ${calldata.slice(0, 10)}`)

  // Recipient should be ABI-encoded (zero-padded to 32 bytes) in bytes 4-36
  const encodedRecipient = calldata.slice(10, 74) // 32 bytes = 64 hex chars
  assert(
    encodedRecipient.toLowerCase().includes(EVM_RECIPIENT.slice(2).toLowerCase()),
    `encoded recipient should contain address bytes`,
  )
})

// ---------------------------------------------------------------------------
// Test: submitTransfer (signAndSend injection)
// ---------------------------------------------------------------------------

await test('USDC-Base: signAndSend injection submits transfer and returns txHash', async () => {
  process.env.BASE_NETWORK = 'sepolia'
  process.env.PQSAFE_MOCK_MODE = '0'

  const config: UsdcBaseConfig = {
    network: 'sepolia',
    signAndSend: makeStubSigner(MOCK_TX_HASH),
  }

  const env = makeEnvelope()
  const req = makeRequest({ amount: 25 })
  const result = await executePayment(env, req, config)

  assert(result.success === true, `success should be true, got ${result.success}`)
  assert(result.rail === 'usdc-base', `rail should be usdc-base, got ${result.rail}`)
  assert(result.txId === MOCK_TX_HASH, `txId should be ${MOCK_TX_HASH}, got ${result.txId}`)
  assert(result.currency === 'USDC', `currency should be USDC, got ${result.currency}`)
  assert(result.meta?.mock === false, 'should NOT be mock mode')
  assert(result.meta?.network === 'sepolia', `meta.network should be sepolia, got ${result.meta?.network}`)
  assert(result.meta?.atomicAmount === '25000000', `atomic amount should be 25000000, got ${result.meta?.atomicAmount}`)
})

// ---------------------------------------------------------------------------
// Test: waitForReceipt — mock mode returns immediately with txHash
// ---------------------------------------------------------------------------

await test('USDC-Base: mock mode returns txHash without signing (waitForReceipt pattern)', async () => {
  process.env.PQSAFE_MOCK_MODE = '1'
  delete process.env.BASE_NETWORK

  // No signAndSend → mock mode
  const config: UsdcBaseConfig = { network: 'sepolia' }
  const env = makeEnvelope()
  const req = makeRequest({ amount: 5 })
  const result = await executePayment(env, req, config)

  assert(result.success === true, 'mock should succeed')
  assert(result.txId.startsWith('0x'), `mock txId should start with 0x, got ${result.txId}`)
  assert(result.txId.length === 66, `mock txId should be 66 chars (0x + 32 bytes), got ${result.txId.length}`)
  assert(result.meta?.mock === true, 'mock flag should be set')
  assert(result.currency === 'USDC', 'currency should be USDC in mock mode')
})

// ---------------------------------------------------------------------------
// Test: toUsdcAtomicUnits conversion
// ---------------------------------------------------------------------------

await test('USDC-Base: toUsdcAtomicUnits converts decimals correctly (6 dp)', () => {
  assert(toUsdcAtomicUnits(1) === 1_000_000n, '1 USDC = 1_000_000 atomic units')
  assert(toUsdcAtomicUnits(1.5) === 1_500_000n, '1.5 USDC = 1_500_000 atomic units')
  assert(toUsdcAtomicUnits(0.01) === 10_000n, '0.01 USDC = 10_000 atomic units')
  assert(toUsdcAtomicUnits(100) === 100_000_000n, '100 USDC = 100_000_000 atomic units')
  assert(toUsdcAtomicUnits(0.000001) === 1n, '0.000001 USDC = 1 atomic unit (minimum)')
})

// ---------------------------------------------------------------------------
// Test: Non-EVM address rejected
// ---------------------------------------------------------------------------

await test('USDC-Base: non-EVM recipient address is rejected', async () => {
  process.env.PQSAFE_MOCK_MODE = '0'
  const config: UsdcBaseConfig = {
    network: 'sepolia',
    signAndSend: makeStubSigner(),
  }
  const env = makeEnvelope({ allowedRecipients: ['GB29NWBK60161331926819'] })
  const req = makeRequest({ recipient: 'GB29NWBK60161331926819' })

  await assertThrows(
    () => executePayment(env, req, config),
    /must be a 0x EVM address/,
    'non-EVM address',
  )
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('')
console.log('\x1b[35m\x1b[1m  PQSafe AgentPay — USDC-Base rail suite\x1b[0m')
console.log(`\n  \x1b[1m${passed + failed} tests · ${passed} passed · ${failed} failed\x1b[0m`)
if (failed > 0) {
  console.log('\n\x1b[31m  Failures:\x1b[0m')
  for (const f of failures) {
    console.log(`    • ${f.name}\n      \x1b[90m${f.err}\x1b[0m`)
  }
  process.exit(1)
} else {
  console.log('  \x1b[32mAll USDC-Base rail tests passed.\x1b[0m\n')
}
