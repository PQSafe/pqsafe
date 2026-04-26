/**
 * Airwallex sandbox integration tests
 *
 * Only runs when AWX_SANDBOX_KEY env var is set.
 * Skip gracefully in CI when secrets are missing.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createEnvelope, signEnvelope, executeAgentPayment, setAgentPayConfig } from '../../src/index.js'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'

const AWX_KEY = process.env.AWX_SANDBOX_KEY
const SKIP = !AWX_KEY

function freshKeypair() {
  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const address = 'pq1' + bytesToHex(keccak_256(publicKey).slice(0, 20))
  return { publicKey, secretKey, address }
}

describe.skipIf(SKIP)('Airwallex sandbox integration', () => {
  beforeAll(() => {
    if (!AWX_KEY) return
    // Configure Airwallex with sandbox credentials
    setAgentPayConfig({
      mockMode: false,
      airwallex: {
        clientId: process.env.AWX_CLIENT_ID ?? 'sandbox-client',
        apiKey: AWX_KEY!,
        env: 'sandbox',
      },
    })
  })

  it.skipIf(SKIP)('creates payment and receives txId from Airwallex sandbox', async () => {
    if (SKIP) return

    const { address, secretKey, publicKey } = freshKeypair()
    const SANDBOX_IBAN = process.env.AWX_SANDBOX_IBAN ?? 'GB29NWBK60161331926819'

    const envelope = createEnvelope({
      issuer: address,
      agent: 'integration-test-agent',
      maxAmount: 10,
      currency: 'USD',
      allowedRecipients: [SANDBOX_IBAN],
      ttlSeconds: 3600,
      rail: 'airwallex',
    })

    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: SANDBOX_IBAN,
      amount: 1,
      memo: 'Integration test payment',
    })

    expect(result.success).toBe(true)
    expect(result.rail).toBe('airwallex')
    expect(typeof result.txId).toBe('string')
    expect(result.txId.length).toBeGreaterThan(0)
    expect(result.amount).toBe(1)
    expect(result.meta?.mock).toBe(false)
  })

  it.skipIf(SKIP)('rejects payment over envelope ceiling even with valid API key', async () => {
    if (SKIP) return

    const { address, secretKey, publicKey } = freshKeypair()
    const SANDBOX_IBAN = process.env.AWX_SANDBOX_IBAN ?? 'GB29NWBK60161331926819'

    const envelope = createEnvelope({
      issuer: address,
      agent: 'integration-ceiling-test',
      maxAmount: 5,
      currency: 'USD',
      allowedRecipients: [SANDBOX_IBAN],
      ttlSeconds: 3600,
      rail: 'airwallex',
    })

    const signed = signEnvelope(envelope, secretKey, publicKey)
    await expect(
      executeAgentPayment(signed, { recipient: SANDBOX_IBAN, amount: 6 }),
    ).rejects.toThrow(/exceeds envelope maxAmount/)
  })
})

if (SKIP) {
  describe('Airwallex sandbox integration', () => {
    it('SKIPPED — AWX_SANDBOX_KEY not set', () => {
      console.log('  [SKIP] AWX_SANDBOX_KEY not in environment — Airwallex sandbox tests skipped')
    })
  })
}
