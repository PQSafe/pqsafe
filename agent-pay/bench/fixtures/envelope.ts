/**
 * bench/fixtures/envelope.ts
 *
 * Pre-built envelope fixtures for canonicalization and sign benchmarks.
 */

import { createEnvelope, signEnvelope } from '../../src/envelope.js'
import { FIXTURE_SECRET_KEY, FIXTURE_PUBLIC_KEY } from './keypair.js'

export const ENVELOPE_PARAMS = {
  issuer: 'pq1' + 'a'.repeat(40),
  agent: 'bench-agent-v1',
  maxAmount: 1000,
  currency: 'USD' as const,
  allowedRecipients: ['GB29NWBK60161331926819'],
  ttlSeconds: 3600,
  rail: 'airwallex' as const,
}

export const ENVELOPE_1KB = createEnvelope(ENVELOPE_PARAMS)

// Pre-signed envelope for verify bench
export const SIGNED_ENVELOPE = signEnvelope(ENVELOPE_1KB, FIXTURE_SECRET_KEY, FIXTURE_PUBLIC_KEY)
