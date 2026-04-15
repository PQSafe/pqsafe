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
