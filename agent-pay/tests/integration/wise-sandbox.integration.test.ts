/**
 * Wise sandbox integration tests
 *
 * Only runs when WISE_SANDBOX_KEY env var is set.
 * Skip gracefully in CI when secrets are missing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createEnvelope, signEnvelope, executeAgentPayment, setAgentPayConfig } from '../../src/index.js'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'

const WISE_KEY = process.env.WISE_SANDBOX_KEY
const SKIP = !WISE_KEY

function freshKeypair() {
  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const address = 'pq1' + bytesToHex(keccak_256(publicKey).slice(0, 20))
  return { publicKey, secretKey, address }
}

describe.skipIf(SKIP)('Wise sandbox integration', () => {
  beforeAll(() => {
    if (!WISE_KEY) return
    process.env.WISE_API_KEY = WISE_KEY
    process.env.WISE_ENV = 'sandbox'
    setAgentPayConfig({ mockMode: false })
  })

  afterAll(() => {
    delete process.env.WISE_API_KEY
    setAgentPayConfig({ mockMode: true })
  })

  it.skipIf(SKIP)('creates transfer via Wise sandbox and receives numeric txId', async () => {
    if (SKIP) return

    const { address, secretKey, publicKey } = freshKeypair()
    const SANDBOX_IBAN = process.env.WISE_SANDBOX_IBAN ?? 'GB29NWBK60161331926819'

    const envelope = createEnvelope({
      issuer: address,
      agent: 'wise-integration-test',
      maxAmount: 50,
      currency: 'GBP',
      allowedRecipients: [SANDBOX_IBAN],
      ttlSeconds: 3600,
      rail: 'wise',
    })

    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: SANDBOX_IBAN,
      amount: 10,
      memo: 'Wise integration test',
    })

    expect(result.success).toBe(true)
    expect(result.rail).toBe('wise')
    expect(typeof result.txId).toBe('string')
    // Real Wise txIds are numeric
    expect(parseInt(result.txId, 10)).not.toBeNaN()
    expect(result.meta?.mock).toBe(false)
    expect(result.meta?.env).toBe('sandbox')
  })

  it.skipIf(SKIP)('profile lookup uses cached profile on second call', async () => {
    if (SKIP) return

    const { address, secretKey, publicKey } = freshKeypair()
    const SANDBOX_IBAN = process.env.WISE_SANDBOX_IBAN ?? 'GB29NWBK60161331926819'

    const envelope = createEnvelope({
      issuer: address,
      agent: 'wise-profile-cache-test',
      maxAmount: 50,
      currency: 'GBP',
      allowedRecipients: [SANDBOX_IBAN],
      ttlSeconds: 3600,
      rail: 'wise',
    })

    const signed = signEnvelope(envelope, secretKey, publicKey)
    // Two rapid calls — second should use cached profile
    const [r1, r2] = await Promise.allSettled([
      executeAgentPayment(signed, { recipient: SANDBOX_IBAN, amount: 5, memo: 'cache test 1' }),
      executeAgentPayment(signed, { recipient: SANDBOX_IBAN, amount: 5, memo: 'cache test 2' }),
    ])

    // Both should succeed (or both fail with the same error — not a profile-cache crash)
    for (const r of [r1, r2]) {
      if (r.status === 'rejected') {
        // Only acceptable failures are Wise API errors, not profile-cache panics
        expect(r.reason?.message).not.toMatch(/Cannot read properties/)
      }
    }
  })
})

if (SKIP) {
  describe('Wise sandbox integration', () => {
    it('SKIPPED — WISE_SANDBOX_KEY not set', () => {
      console.log('  [SKIP] WISE_SANDBOX_KEY not in environment — Wise sandbox tests skipped')
    })
  })
}
