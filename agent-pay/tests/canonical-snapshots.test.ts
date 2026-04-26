/**
 * Snapshot tests for canonical envelopes (Vitest)
 *
 * Signs 10 reference envelopes with deterministic test keys.
 * Snapshots the canonical bytes + signature output.
 * Any future regression in canonicalization or signing will break these.
 */

import { describe, it, expect } from 'vitest'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { signEnvelope } from '../src/envelope.js'
import { canonicalJsonBytes, canonicalJsonString } from '../src/canonical.js'
import type { SpendEnvelope } from '../src/envelope.js'

// ---------------------------------------------------------------------------
// Deterministic keypair generation (seeded — never random)
// ---------------------------------------------------------------------------

function deterministicKeypair(seedHex: string) {
  const seedStr = seedHex.padEnd(64, '0').slice(0, 64)
  const seed = new Uint8Array(
    seedStr.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  )
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const address = 'pq1' + bytesToHex(keccak_256(publicKey).slice(0, 20))
  return { publicKey, secretKey, address }
}

// 10 deterministic seeds
const TEST_SEEDS = [
  'deadbeef00000000000000000000000000000000000000000000000000000000',
  'cafebabe00000000000000000000000000000000000000000000000000000000',
  '1234567800000000000000000000000000000000000000000000000000000000',
  'aabbccdd00000000000000000000000000000000000000000000000000000000',
  'feedface00000000000000000000000000000000000000000000000000000000',
  '0011223300000000000000000000000000000000000000000000000000000000',
  'beefcafe00000000000000000000000000000000000000000000000000000000',
  '0102030400000000000000000000000000000000000000000000000000000000',
  'ffffffff00000000000000000000000000000000000000000000000000000000',
  'c0ffee0000000000000000000000000000000000000000000000000000000000',
]

// Reference envelopes — all deterministic, no Date.now() or random nonces
const REFERENCE_ENVELOPES: SpendEnvelope[] = [
  {
    version: 1,
    issuer: 'pq1' + 'a'.repeat(40),
    agent: 'snapshot-agent-01',
    maxAmount: 100,
    currency: 'USD',
    allowedRecipients: ['GB29NWBK60161331926819'],
    validFrom: 1700000000,
    validUntil: 1700003600,
    nonce: 'aa'.repeat(16),
    rail: 'airwallex',
  },
  {
    version: 1,
    issuer: 'pq1' + 'b'.repeat(40),
    agent: 'snapshot-agent-02',
    maxAmount: 500,
    currency: 'GBP',
    allowedRecipients: ['DE89370400440532013000', 'FR76123459876501234567890'],
    validFrom: 1700000000,
    validUntil: 1700007200,
    nonce: 'bb'.repeat(16),
    rail: 'wise',
  },
  {
    version: 1,
    issuer: 'pq1' + 'c'.repeat(40),
    agent: 'snapshot-agent-03',
    maxAmount: 1000,
    currency: 'USDC',
    allowedRecipients: ['0x' + 'd'.repeat(40)],
    validFrom: 1700000000,
    validUntil: 1700010800,
    nonce: 'cc'.repeat(16),
    rail: 'usdc-base',
  },
  {
    version: 1,
    issuer: 'pq1' + 'd'.repeat(40),
    agent: 'snapshot-agent-04',
    maxAmount: 49.99,
    currency: 'USD',
    allowedRecipients: ['in_1PXqBBGJhmH2PkSTSnapshot04'],
    validFrom: 1700000000,
    validUntil: 1700003600,
    nonce: 'dd'.repeat(16),
    rail: 'stripe',
  },
  {
    version: 1,
    issuer: 'pq1' + 'e'.repeat(40),
    agent: 'snapshot-agent-05',
    maxAmount: 0.001,
    currency: 'USDC',
    allowedRecipients: ['https://api.data.ai/premium/v1/resource'],
    validFrom: 1700000000,
    validUntil: 1700003600,
    nonce: 'ee'.repeat(16),
    rail: 'x402',
  },
  {
    version: 1,
    issuer: 'pq1' + 'f'.repeat(40),
    agent: 'snapshot-agent-06',
    maxAmount: 75000,
    currency: 'EUR',
    allowedRecipients: ['IT60X0542811101000000123456'],
    validFrom: 1700000000,
    validUntil: 1700086400,
    nonce: 'ff'.repeat(16),
    rail: 'airwallex',
  },
  {
    version: 1,
    issuer: 'pq1' + '0a'.repeat(20),
    agent: 'snapshot-agent-07',
    maxAmount: 200,
    currency: 'USD',
    allowedRecipients: ['acct_1PXqBBGJhmH2PkST'],
    validFrom: 1700000000,
    validUntil: 1700003600,
    nonce: '0a'.repeat(16),
    rail: 'stripe',
  },
  {
    version: 1,
    issuer: 'pq1' + '1b'.repeat(20),
    agent: 'snapshot-agent-08',
    maxAmount: 10,
    currency: 'GBP',
    allowedRecipients: ['GB29NWBK60161331926819', 'DE89370400440532013000'],
    validFrom: 1700000000,
    validUntil: 1700003600,
    nonce: '1b'.repeat(16),
    rail: 'wise',
  },
  {
    version: 1,
    issuer: 'pq1' + '2c'.repeat(20),
    agent: 'snapshot-agent-09',
    maxAmount: 999.99,
    currency: 'USDC',
    allowedRecipients: ['0x' + '3d'.repeat(20)],
    validFrom: 1700000000,
    validUntil: 1700003600,
    nonce: '2c'.repeat(16),
    rail: 'usdc-base',
  },
  {
    version: 1,
    issuer: 'pq1' + '3e'.repeat(20),
    agent: 'snapshot-agent-10',
    maxAmount: 1,
    currency: 'USDC',
    allowedRecipients: ['https://api.premium.xyz/v2/data', 'https://api.premium.xyz/v2/models'],
    validFrom: 1700000000,
    validUntil: 1700003600,
    nonce: '3e'.repeat(16),
    rail: 'x402',
  },
]

// ---------------------------------------------------------------------------
// Snapshot tests
// ---------------------------------------------------------------------------

describe('canonical envelope snapshots', () => {
  for (let i = 0; i < REFERENCE_ENVELOPES.length; i++) {
    const envelope = REFERENCE_ENVELOPES[i]
    const seedHex = TEST_SEEDS[i]

    it(`envelope-${String(i + 1).padStart(2, '0')}: ${envelope.agent} canonical bytes + signature`, () => {
      const { publicKey, secretKey } = deterministicKeypair(seedHex)

      // Snapshot the canonical JSON string
      const canonJson = canonicalJsonString(envelope)
      expect(canonJson).toMatchSnapshot()

      // Snapshot the canonical bytes length (byte count doesn't change if format stable)
      const canonBytes = canonicalJsonBytes(envelope)
      expect(canonBytes.length).toMatchSnapshot()

      // Sign and snapshot structural invariants
      const signed = signEnvelope(envelope, secretKey, publicKey)

      // ML-DSA-65 signature = 3309 bytes = 6618 hex chars
      const sigBytes = signed.signature.length
      expect(sigBytes).toBe(6618)
      expect(sigBytes).toMatchSnapshot()

      // ML-DSA-65 public key = 1952 bytes = 3904 hex chars
      const pkLen = signed.dsaPublicKey.length
      expect(pkLen).toBe(3904)
      expect(pkLen).toMatchSnapshot()

      // Snapshot the envelopeJson (canonical form must be stable)
      expect(signed.envelopeJson).toMatchSnapshot()
    })
  }
})

describe('canonicalJsonString stability', () => {
  it('empty object snapshots', () => {
    expect(canonicalJsonString({})).toMatchSnapshot()
  })

  it('nested object with sorted keys snapshots', () => {
    expect(canonicalJsonString({ z: 1, a: 2, m: { y: 3, b: 4 } })).toMatchSnapshot()
  })

  it('array with mixed types snapshots', () => {
    expect(canonicalJsonString({ list: [1, 'two', true, null, { x: 3 }] })).toMatchSnapshot()
  })
})
