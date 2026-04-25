/**
 * PQSafe AgentPay — guardrail test suite
 *
 * Zero-dependency runner (no mocha/vitest) — just pure assertions.
 * Every test here corresponds to a security claim on pqsafe.xyz or in the
 * YC application. If any of these pass silently when they should have failed,
 * the YC pitch is a lie — keep this suite brutal.
 *
 * Run:  npm test
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import {
  createEnvelope,
  signEnvelope,
  verifyEnvelope,
  executeAgentPayment,
  setAgentPayConfig,
} from '../src/index.js'
import type { SignedEnvelope } from '../src/types.js'

// ---------------------------------------------------------------------------
// Harness
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
  try {
    await fn()
  } catch (e) {
    threw = true
    errMsg = e instanceof Error ? e.message : String(e)
  }
  assert(threw, `${label}: expected throw, but nothing threw`)
  const ok =
    typeof match === 'string' ? errMsg.includes(match) : match.test(errMsg)
  assert(
    ok,
    `${label}: error "${errMsg}" did not match ${match}`,
  )
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function freshKeypair() {
  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const address = 'pq1' + bytesToHex(keccak_256(publicKey).slice(0, 20))
  return { publicKey, secretKey, address }
}

const GOOD_RECIPIENT = 'GB29NWBK60161331926819'
const BAD_RECIPIENT = 'ATTACKER_ACCOUNT_XYZ'

function buildValidEnvelope(issuer: string) {
  return createEnvelope({
    issuer,
    agent: 'test-agent',
    maxAmount: 200,
    currency: 'USD',
    allowedRecipients: [GOOD_RECIPIENT],
    ttlSeconds: 3600,
    rail: 'airwallex',
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function run() {
  // Force mock mode so rail calls don't hit any network
  setAgentPayConfig({ mockMode: true })

  console.log('')
  console.log('\x1b[35m\x1b[1m  PQSafe AgentPay — guardrail test suite\x1b[0m')
  console.log('\x1b[90m  ML-DSA-65 signing + envelope policy enforcement\x1b[0m')
  console.log('')

  // --- Signing round-trip ------------------------------------------------

  await test('sign → verify round-trip returns the same envelope', () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    const verified = verifyEnvelope(signed)
    assert(verified.issuer === env.issuer, 'issuer mismatch')
    assert(verified.agent === env.agent, 'agent mismatch')
    assert(verified.nonce === env.nonce, 'nonce mismatch')
    assert(verified.maxAmount === env.maxAmount, 'amount mismatch')
  })

  await test('verify fails when signature is flipped to another issuer', () => {
    const alice = freshKeypair()
    const mallory = freshKeypair()
    const env = buildValidEnvelope(alice.address)
    // Sign with Mallory's keys but claim Alice is the issuer
    const signed = signEnvelope(env, mallory.secretKey, alice.publicKey)
    // Must throw — Alice's pubkey will not verify Mallory's signature
    let threw = false
    try {
      verifyEnvelope(signed)
    } catch {
      threw = true
    }
    assert(threw, 'verify should reject cross-signer signature')
  })

  await test('verify fails when envelopeJson is tampered after signing', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    // Attacker bumps maxAmount from 200 → 999999
    const tampered: SignedEnvelope = {
      ...signed,
      envelopeJson: signed.envelopeJson.replace('"maxAmount":200', '"maxAmount":999999'),
    }
    await assertThrows(
      () => verifyEnvelope(tampered),
      /verification failed/,
      'tampered envelope',
    )
  })

  await test('verify fails when signature bytes are corrupted', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    // Flip a byte in the middle of the signature
    const sigBytes = hexToBytes(signed.signature)
    sigBytes[100] = sigBytes[100] ^ 0xff
    const tampered: SignedEnvelope = {
      ...signed,
      signature: bytesToHex(sigBytes),
    }
    await assertThrows(
      () => verifyEnvelope(tampered),
      /verification failed/,
      'corrupted signature',
    )
  })

  // --- Temporal guardrails -----------------------------------------------

  await test('verify rejects envelope that has not yet activated', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = createEnvelope({
      issuer: address,
      agent: 'test-agent',
      maxAmount: 100,
      currency: 'USD',
      allowedRecipients: [GOOD_RECIPIENT],
      startsInSeconds: 3600, // not valid for another hour
      ttlSeconds: 7200,
    })
    const signed = signEnvelope(env, secretKey, publicKey)
    await assertThrows(
      () => verifyEnvelope(signed),
      /not yet active/,
      'future-dated envelope',
    )
  })

  await test('verify rejects envelope that has expired', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    // Build a valid envelope and then backdate it by mutating before signing
    const env = buildValidEnvelope(address)
    const expired = {
      ...env,
      validFrom: env.validFrom - 7200,
      validUntil: env.validFrom - 3600, // expired 1h ago
    }
    const signed = signEnvelope(expired, secretKey, publicKey)
    await assertThrows(
      () => verifyEnvelope(signed),
      /expired/,
      'expired envelope',
    )
  })

  // --- Policy guardrails at execution time -------------------------------

  await test('executeAgentPayment succeeds on an in-policy request', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: GOOD_RECIPIENT,
      amount: 50,
      memo: 'in-policy test',
    })
    assert(result.success === true, 'payment should succeed')
    assert(result.rail === 'airwallex', 'rail should be airwallex')
    assert(result.amount === 50, 'amount should match request')
    assert(result.meta?.mock === true, 'should be in mock mode')
  })

  await test('executeAgentPayment rejects amount over ceiling', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    await assertThrows(
      () =>
        executeAgentPayment(signed, {
          recipient: GOOD_RECIPIENT,
          amount: 201, // just over the 200 ceiling
        }),
      /exceeds envelope maxAmount/,
      'overspend',
    )
  })

  await test('executeAgentPayment rejects recipient not in allowlist', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    await assertThrows(
      () =>
        executeAgentPayment(signed, {
          recipient: BAD_RECIPIENT,
          amount: 10,
        }),
      /not in the envelope allowlist/,
      'bad recipient',
    )
  })

  await test('executeAgentPayment rejects zero/negative amount', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    await assertThrows(
      () =>
        executeAgentPayment(signed, {
          recipient: GOOD_RECIPIENT,
          amount: 0,
        }),
      /must be positive/,
      'zero amount',
    )
    await assertThrows(
      () =>
        executeAgentPayment(signed, {
          recipient: GOOD_RECIPIENT,
          amount: -5,
        }),
      /must be positive/,
      'negative amount',
    )
  })

  // --- Schema guardrails -------------------------------------------------

  await test('createEnvelope rejects empty allowlist', () => {
    const { address } = freshKeypair()
    let threw = false
    try {
      createEnvelope({
        issuer: address,
        agent: 'test-agent',
        maxAmount: 100,
        currency: 'USD',
        allowedRecipients: [],
      })
    } catch {
      threw = true
    }
    assert(threw, 'empty allowlist should throw')
  })

  await test('createEnvelope rejects malformed issuer address', () => {
    let threw = false
    try {
      createEnvelope({
        issuer: 'not-a-pqsafe-address',
        agent: 'test-agent',
        maxAmount: 100,
        currency: 'USD',
        allowedRecipients: [GOOD_RECIPIENT],
      })
    } catch {
      threw = true
    }
    assert(threw, 'bad issuer should throw')
  })

  await test('createEnvelope rejects non-positive maxAmount', () => {
    const { address } = freshKeypair()
    let threw = false
    try {
      createEnvelope({
        issuer: address,
        agent: 'test-agent',
        maxAmount: 0,
        currency: 'USD',
        allowedRecipients: [GOOD_RECIPIENT],
      })
    } catch {
      threw = true
    }
    assert(threw, 'zero maxAmount should throw')
  })

  // -------------------------------------------------------------------------
  // Wise rail (mock mode)
  // -------------------------------------------------------------------------

  await test('Wise rail executes in mock mode (IBAN recipient)', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'wise-test-agent',
      maxAmount: 100,
      currency: 'GBP',
      allowedRecipients: ['GB29NWBK60161331926819'],
      rail: 'wise',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: 'GB29NWBK60161331926819',
      amount: 50,
      memo: 'Wise IBAN test',
    })
    assert(result.success, 'Wise mock should succeed')
    assert(result.rail === 'wise', `Expected rail=wise, got ${result.rail}`)
    assert(result.txId.startsWith('wise_sbx_'), `Expected wise_sbx_ txId, got ${result.txId}`)
    assert(result.amount === 50, 'Amount should be 50')
    setAgentPayConfig({ mockMode: false })
  })

  await test('Wise rail respects amount ceiling', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'wise-ceiling-agent',
      maxAmount: 30,
      currency: 'GBP',
      allowedRecipients: ['GB29NWBK60161331926819'],
      rail: 'wise',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    await assertThrows(
      () => executeAgentPayment(signed, { recipient: 'GB29NWBK60161331926819', amount: 31 }),
      'exceeds envelope maxAmount',
    )
    setAgentPayConfig({ mockMode: false })
  })

  // -------------------------------------------------------------------------
  // Approval gate (mock mode, below threshold)
  // -------------------------------------------------------------------------

  await test('executeWithApproval auto-approves below threshold', async () => {
    const { executeWithApproval } = await import('../src/approval.js')
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'approval-test-agent',
      maxAmount: 200,
      currency: 'USD',
      allowedRecipients: [GOOD_RECIPIENT],
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeWithApproval(signed, {
      recipient: GOOD_RECIPIENT,
      amount: 50,  // below default Infinity threshold
      memo: 'auto-approved test',
    }, { autoApproveThreshold: 100 })
    assert(result.success, 'Should auto-approve below threshold')
    setAgentPayConfig({ mockMode: false })
  })

  await test('executeWithApproval throws above threshold when no Telegram config', async () => {
    const { executeWithApproval } = await import('../src/approval.js')
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'approval-gate-agent',
      maxAmount: 200,
      currency: 'USD',
      allowedRecipients: [GOOD_RECIPIENT],
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    await assertThrows(
      () => executeWithApproval(signed, {
        recipient: GOOD_RECIPIENT,
        amount: 150,  // above threshold
      }, { autoApproveThreshold: 100 }),
      'threshold',
    )
    setAgentPayConfig({ mockMode: false })
  })

  // -------------------------------------------------------------------------
  // USDC-Base rail (mock mode)
  // -------------------------------------------------------------------------

  await test('USDC-Base rail executes in mock mode (EVM address)', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const EVM_RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    const envelope = createEnvelope({
      issuer: address,
      agent: 'usdc-base-test-agent',
      maxAmount: 500,
      currency: 'USDC',
      allowedRecipients: [EVM_RECIPIENT],
      rail: 'usdc-base',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: EVM_RECIPIENT,
      amount: 100,
      memo: 'USDC-Base mock test',
    })
    assert(result.success, 'USDC-Base mock should succeed')
    assert(result.rail === 'usdc-base', `Expected rail=usdc-base, got ${result.rail}`)
    assert(/^0x[0-9a-f]{64}$/.test(result.txId), `Expected 0x tx hash, got ${result.txId}`)
    assert(result.amount === 100, 'Amount should be 100')
    assert(result.currency === 'USDC', `Expected USDC currency, got ${result.currency}`)
    assert(result.meta?.mock === true, 'Should be in mock mode')
    setAgentPayConfig({ mockMode: false })
  })

  await test('USDC-Base rejects non-EVM recipient', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'usdc-base-reject-agent',
      maxAmount: 500,
      currency: 'USDC',
      allowedRecipients: [GOOD_RECIPIENT],
      rail: 'usdc-base',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    await assertThrows(
      () => executeAgentPayment(signed, { recipient: GOOD_RECIPIENT, amount: 50 }),
      /EVM address/,
      'non-EVM recipient',
    )
    setAgentPayConfig({ mockMode: false })
  })

  await test('toUsdcAtomicUnits converts decimals correctly', async () => {
    const { toUsdcAtomicUnits } = await import('../src/rails/usdc-base.js')
    assert(toUsdcAtomicUnits(1) === 1_000_000n, '1 USDC = 1_000_000 atomic')
    assert(toUsdcAtomicUnits(1.5) === 1_500_000n, '1.5 USDC = 1_500_000 atomic')
    assert(toUsdcAtomicUnits(100) === 100_000_000n, '100 USDC = 100_000_000 atomic')
    assert(toUsdcAtomicUnits(0.000001) === 1n, '0.000001 USDC = 1 atomic (min unit)')
  })

  await test('encodeTransferCalldata produces 68-byte 0x-prefixed calldata', async () => {
    const { encodeTransferCalldata, toUsdcAtomicUnits } = await import('../src/rails/usdc-base.js')
    const to = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    const amount = toUsdcAtomicUnits(100)
    const calldata = encodeTransferCalldata(to, amount)
    // 4 byte selector + 32 byte address + 32 byte amount = 68 bytes = 136 hex chars + '0x' = 138
    assert(calldata.startsWith('0x'), 'calldata should start with 0x')
    assert(calldata.length === 2 + 136, `Expected 138 chars, got ${calldata.length}`)
    // Function selector for transfer(address,uint256) = 0xa9059cbb
    assert(calldata.startsWith('0xa9059cbb'), 'selector should be 0xa9059cbb')
  })

  // -------------------------------------------------------------------------
  // Stripe rail (mock mode)
  // -------------------------------------------------------------------------

  await test('Stripe rail executes in mock mode (invoice ID recipient)', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const STRIPE_INVOICE = 'in_1PXqBBGJhmH2PkSTDemoTest123'
    const envelope = createEnvelope({
      issuer: address,
      agent: 'stripe-test-agent',
      maxAmount: 500,
      currency: 'USD',
      allowedRecipients: [STRIPE_INVOICE],
      rail: 'stripe',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: STRIPE_INVOICE,
      amount: 49,
      memo: 'Anthropic API credits',
    })
    assert(result.success, 'Stripe mock should succeed')
    assert(result.rail === 'stripe', `Expected rail=stripe, got ${result.rail}`)
    assert(result.txId.startsWith('pi_sbx_'), `Expected pi_sbx_ txId, got ${result.txId}`)
    assert(result.meta?.recipientType === 'invoice', 'meta.recipientType should be invoice')
    setAgentPayConfig({ mockMode: false })
  })

  // -------------------------------------------------------------------------
  // x402 rail (mock mode)
  // -------------------------------------------------------------------------

  await test('x402 rail executes in mock mode (URL-style recipient)', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const X402_RECIPIENT = 'https://api.example.com/premium-data'
    const envelope = createEnvelope({
      issuer: address,
      agent: 'x402-test-agent',
      maxAmount: 10,
      currency: 'USDC',
      allowedRecipients: [X402_RECIPIENT],
      rail: 'x402',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: X402_RECIPIENT,
      amount: 0.001,
      memo: 'x402 micropayment',
    })
    assert(result.success, 'x402 mock should succeed')
    assert(result.rail === 'x402', `Expected rail=x402, got ${result.rail}`)
    assert(result.txId.startsWith('x402_sbx_'), `Expected x402_sbx_ txId, got ${result.txId}`)
    assert(result.meta?.protocol === 'x402', 'meta.protocol should be x402')
    setAgentPayConfig({ mockMode: false })
  })

  // --- Report ------------------------------------------------------------

  console.log('')
  console.log(
    `  \x1b[1m${passed + failed} tests · ${passed} passed · ${failed} failed\x1b[0m`,
  )
  if (failed > 0) {
    console.log('')
    console.log('\x1b[31m  Failures:\x1b[0m')
    for (const f of failures) {
      console.log(`    • ${f.name}`)
      console.log(`      \x1b[90m${f.err}\x1b[0m`)
    }
    process.exit(1)
  } else {
    console.log('  \x1b[32mAll guardrails held.\x1b[0m')
    console.log('')
  }
}

run().catch((err) => {
  console.error('\x1b[31mTest runner crashed:\x1b[0m', err)
  process.exit(1)
})
