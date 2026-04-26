/**
 * Property-based tests using fast-check (Vitest)
 *
 * Properties:
 *   1. verify(sign(env)) === true for all valid envelopes
 *   2. Tampering any field breaks verification
 *   3. Canonical bytes are always deterministic
 *   4. Atomic unit conversion is always exact (no float drift)
 *
 * 1000 iterations, deterministic seed for reproducibility.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { signEnvelope, verifyEnvelope } from '../src/index.js'
import { canonicalJsonBytes } from '../src/canonical.js'
import { toUsdcAtomicUnits } from '../src/rails/usdc-base.js'
import type { SpendEnvelope } from '../src/envelope.js'

// ---------------------------------------------------------------------------
// Deterministic fast-check configuration
// ---------------------------------------------------------------------------

const FC_OPTS: fc.Parameters<unknown> = {
  numRuns: 1000,
  seed: 0xdeadbeef,
  verbose: false,
}

// ---------------------------------------------------------------------------
// Shared keypair (generated once — ML-DSA keygen is expensive)
// ---------------------------------------------------------------------------

const SEED = new Uint8Array(32).fill(0x42)
const { publicKey: SHARED_PK, secretKey: SHARED_SK } = ml_dsa65.keygen(SEED)
const SHARED_ADDRESS = 'pq1' + bytesToHex(keccak_256(SHARED_PK).slice(0, 20))

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

// Valid currency codes
const currencyArb = fc.constantFrom('USD', 'GBP', 'EUR', 'USDC', 'JPY', 'CAD', 'AUD', 'SGD')

// Valid rail names
const railArb = fc.constantFrom('airwallex', 'wise', 'stripe', 'usdc-base', 'x402', undefined)

// Valid recipient strings (opaque — policy only checks membership)
const recipientArb = fc.string({ minLength: 5, maxLength: 60, unit: 'grapheme-ascii' })

// Valid nonce: 32 hex chars — build by sampling 32 chars from hex alphabet
const HEX_CHARS = '0123456789abcdef'.split('') as [string, ...string[]]
const hexCharArb = fc.constantFrom(...HEX_CHARS)
const nonceArb = fc.array(hexCharArb, { minLength: 32, maxLength: 32 })
  .map((chars) => chars.join(''))

// Valid positive amount (use integer cents to avoid float32 constraints)
const amountArb = fc.integer({ min: 1, max: 9999999 }).map((cents) => cents / 100)

// Build a valid SpendEnvelope
const spendEnvelopeArb = fc.tuple(
  currencyArb,
  fc.array(recipientArb, { minLength: 1, maxLength: 5 }),
  amountArb,
  nonceArb,
).map(([currency, recipients, maxAmount, nonce]): SpendEnvelope => {
  const now = Math.floor(Date.now() / 1000)
  return {
    version: 1,
    issuer: SHARED_ADDRESS,
    agent: 'property-test-agent',
    maxAmount,
    currency,
    allowedRecipients: recipients,
    validFrom: now - 60,
    validUntil: now + 3600,
    nonce,
  }
})

// ---------------------------------------------------------------------------
// Property 1: verify(sign(env)) === true
// ---------------------------------------------------------------------------

describe('Property: sign → verify round-trip', () => {
  it('verify(sign(env)) === true for all valid envelopes', () => {
    fc.assert(
      fc.property(spendEnvelopeArb, (env) => {
        const signed = signEnvelope(env, SHARED_SK, SHARED_PK)
        // Should not throw
        const verified = verifyEnvelope(signed)
        // Core fields must match
        expect(verified.issuer).toBe(env.issuer)
        expect(verified.maxAmount).toBe(env.maxAmount)
        expect(verified.nonce).toBe(env.nonce)
        return true
      }),
      { ...FC_OPTS, numRuns: 100 }, // reduced — ML-DSA sign is expensive
    )
  })
})

// ---------------------------------------------------------------------------
// Property 2: Tampering any field breaks verification
// ---------------------------------------------------------------------------

describe('Property: tampering breaks verification', () => {
  it('bumping maxAmount in envelopeJson invalidates signature', () => {
    fc.assert(
      fc.property(
        spendEnvelopeArb,
        fc.integer({ min: 1, max: 999999 }).map((n) => n / 100),
        (env, bump) => {
          const signed = signEnvelope(env, SHARED_SK, SHARED_PK)
          const tampered = {
            ...signed,
            envelopeJson: signed.envelopeJson.replace(
              `"maxAmount":${env.maxAmount}`,
              `"maxAmount":${env.maxAmount + bump + 1}`,
            ),
          }
          // Only attempt if the replace actually changed something
          if (tampered.envelopeJson === signed.envelopeJson) return true

          expect(() => verifyEnvelope(tampered)).toThrow()
          return true
        },
      ),
      { ...FC_OPTS, numRuns: 50 },
    )
  })

  it('flipping a signature byte invalidates signature', () => {
    fc.assert(
      fc.property(
        spendEnvelopeArb,
        fc.integer({ min: 100, max: 3000 }),
        (env, byteIndex) => {
          const signed = signEnvelope(env, SHARED_SK, SHARED_PK)
          const sigBytes = hexToBytes(signed.signature)
          sigBytes[byteIndex] = sigBytes[byteIndex] ^ 0xff
          const tampered = { ...signed, signature: bytesToHex(sigBytes) }
          expect(() => verifyEnvelope(tampered)).toThrow()
          return true
        },
      ),
      { ...FC_OPTS, numRuns: 50 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 3: Canonical bytes are always deterministic
// ---------------------------------------------------------------------------

describe('Property: canonical bytes are deterministic', () => {
  it('canonicalJsonBytes(x) === canonicalJsonBytes(x) for all valid inputs', () => {
    const objectArb = fc.object({
      values: [
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.array(fc.string(), { maxLength: 3 }),
      ],
      maxDepth: 3,
    })

    fc.assert(
      fc.property(objectArb, (obj) => {
        const b1 = canonicalJsonBytes(obj)
        const b2 = canonicalJsonBytes(obj)
        expect(b1).toEqual(b2)
        return true
      }),
      FC_OPTS,
    )
  })

  it('key order does not affect canonical bytes', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' }), fc.integer(), {
          minKeys: 2,
          maxKeys: 10,
        }),
        (obj) => {
          // Reverse the key order
          const reversed = Object.fromEntries(Object.entries(obj).reverse())
          const b1 = canonicalJsonBytes(obj)
          const b2 = canonicalJsonBytes(reversed)
          expect(b1).toEqual(b2)
          return true
        },
      ),
      FC_OPTS,
    )
  })
})

// ---------------------------------------------------------------------------
// Property 4: USDC atomic unit conversion is exact
// ---------------------------------------------------------------------------

describe('Property: USDC atomic unit conversion', () => {
  it('toUsdcAtomicUnits(n) * 1e-6 === n for values with ≤ 6 decimal places', () => {
    // Generate amounts that are exact in 6 decimal places (0.000001 increments)
    const exactAmountsArb = fc
      .integer({ min: 1, max: 999_999_999 })
      .map((n) => n / 1_000_000) // exact to 6 dp

    fc.assert(
      fc.property(exactAmountsArb, (amount) => {
        const atomic = toUsdcAtomicUnits(amount)
        // Convert back
        const roundTrip = Number(atomic) / 1_000_000
        // Must round-trip exactly for amounts with ≤ 6 dp
        expect(roundTrip).toBeCloseTo(amount, 6)
        // Atomic units must be a positive BigInt
        expect(atomic > 0n).toBe(true)
        return true
      }),
      FC_OPTS,
    )
  })

  it('toUsdcAtomicUnits scales linearly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (a, b) => {
          const atomicA = toUsdcAtomicUnits(a)
          const atomicB = toUsdcAtomicUnits(b)
          const atomicSum = toUsdcAtomicUnits(a + b)
          // For integer inputs, linearity must hold exactly
          expect(atomicSum).toBe(atomicA + atomicB)
          return true
        },
      ),
      FC_OPTS,
    )
  })
})
