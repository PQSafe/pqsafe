/**
 * Sprint 2 — PQSafeError hierarchy test suite (Vitest)
 *
 * Tests the fully-implemented errors.ts module.
 */

import { describe, it, expect } from 'vitest'
import {
  PQSafeError,
  SignatureError,
  PolicyError,
  TemporalError,
  RevocationError,
  RailError,
  RateLimitError,
  AuthError,
  signatureInvalidError,
  recipientNotAllowedError,
  amountExceedsCeilingError,
  envelopeExpiredError,
  envelopeNotYetActiveError,
  type PQSafeErrorCode,
  type ErrorClass,
} from '../src/sprint2/errors.js'

describe('PQSafeError base class', () => {
  it('is instanceof Error', () => {
    const err = new PQSafeError({ code: 'INTERNAL_UNEXPECTED', human_reason: 'Something went wrong' })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(PQSafeError)
  })

  it('name is PQSafeError', () => {
    const err = new PQSafeError({ code: 'INTERNAL_UNEXPECTED', human_reason: 'test' })
    expect(err.name).toBe('PQSafeError')
  })

  it('message includes code and human_reason', () => {
    const err = new PQSafeError({ code: 'SIGNATURE_INVALID', human_reason: 'tampered envelope' })
    expect(err.message).toContain('SIGNATURE_INVALID')
    expect(err.message).toContain('tampered envelope')
  })

  it('maps code to correct error_class', () => {
    const cases: Array<[PQSafeErrorCode, ErrorClass]> = [
      ['SIGNATURE_INVALID',            'SIGNATURE'],
      ['POLICY_RECIPIENT_NOT_ALLOWED', 'POLICY'],
      ['ENVELOPE_EXPIRED',             'TEMPORAL'],
      ['REVOKED_EPOCH_ADVANCED',       'REVOCATION'],
      ['RAIL_CONNECTION_FAILED',       'RAIL'],
      ['RATE_LIMIT_ISSUER_API',        'RATE_LIMIT'],
      ['AUTH_API_KEY_INVALID',         'AUTH'],
      ['INTERNAL_UNEXPECTED',          'INTERNAL'],
      ['NOT_IMPLEMENTED',              'NOT_IMPL'],
    ]
    for (const [code, expectedClass] of cases) {
      const err = new PQSafeError({ code, human_reason: 'test' })
      expect(err.error_class).toBe(expectedClass)
    }
  })

  it('SIGNATURE errors are never retriable', () => {
    const err = new PQSafeError({ code: 'SIGNATURE_INVALID', human_reason: 'test' })
    expect(err.is_retriable).toBe(false)
  })

  it('POLICY errors are never retriable', () => {
    const err = new PQSafeError({ code: 'POLICY_AMOUNT_EXCEEDS_CEILING', human_reason: 'test' })
    expect(err.is_retriable).toBe(false)
  })

  it('REVOCATION errors are never retriable', () => {
    const err = new PQSafeError({ code: 'REVOKED_EPOCH_ADVANCED', human_reason: 'test' })
    expect(err.is_retriable).toBe(false)
  })

  it('RAIL_CONNECTION_FAILED is retriable', () => {
    const err = new PQSafeError({ code: 'RAIL_CONNECTION_FAILED', human_reason: 'test' })
    expect(err.is_retriable).toBe(true)
  })

  it('RATE_LIMIT_ISSUER_API is retriable with retry_after_ms', () => {
    const err = new PQSafeError({
      code: 'RATE_LIMIT_ISSUER_API',
      human_reason: 'Too many requests',
      retry_after_ms: 5000,
    })
    expect(err.is_retriable).toBe(true)
    expect(err.retry_after_ms).toBe(5000)
  })

  it('AUTH errors are not retriable', () => {
    const err = new PQSafeError({ code: 'AUTH_API_KEY_INVALID', human_reason: 'bad key' })
    expect(err.is_retriable).toBe(false)
  })

  it('context field defaults to empty object', () => {
    const err = new PQSafeError({ code: 'INTERNAL_UNEXPECTED', human_reason: 'test' })
    expect(typeof err.context).toBe('object')
    expect(Object.keys(err.context).length).toBe(0)
  })

  it('context field carries structured data', () => {
    const err = new PQSafeError({
      code: 'POLICY_AMOUNT_EXCEEDS_CEILING',
      human_reason: 'test',
      context: { requested: 250, ceiling: 200, currency: 'USD' },
    })
    expect(err.context['requested']).toBe(250)
    expect(err.context['currency']).toBe('USD')
  })

  it('toJSON returns all structured fields', () => {
    const err = new PQSafeError({
      code: 'SIGNATURE_INVALID',
      human_reason: 'tampered',
      context: { envelopeId: 'abc' },
    })
    const j = err.toJSON()
    expect(j['error_class']).toBe('SIGNATURE')
    expect(j['code']).toBe('SIGNATURE_INVALID')
    expect(j['is_retriable']).toBe(false)
    expect(j['human_reason']).toBe('tampered')
    expect((j['context'] as Record<string, unknown>)['envelopeId']).toBe('abc')
  })
})

describe('PQSafeError subclasses', () => {
  it('SignatureError is instanceof PQSafeError and SignatureError', () => {
    const err = new SignatureError({ code: 'SIGNATURE_INVALID', human_reason: 'test' })
    expect(err).toBeInstanceOf(PQSafeError)
    expect(err).toBeInstanceOf(SignatureError)
    expect(err.name).toBe('SignatureError')
  })

  it('PolicyError is instanceof PQSafeError and PolicyError', () => {
    const err = new PolicyError({ code: 'POLICY_RECIPIENT_NOT_ALLOWED', human_reason: 'test' })
    expect(err).toBeInstanceOf(PQSafeError)
    expect(err).toBeInstanceOf(PolicyError)
    expect(err.name).toBe('PolicyError')
  })

  it('TemporalError is instanceof PQSafeError and TemporalError', () => {
    const err = new TemporalError({ code: 'ENVELOPE_EXPIRED', human_reason: 'test' })
    expect(err).toBeInstanceOf(PQSafeError)
    expect(err).toBeInstanceOf(TemporalError)
  })

  it('RevocationError is instanceof PQSafeError and RevocationError', () => {
    const err = new RevocationError({ code: 'REVOKED_EPOCH_ADVANCED', human_reason: 'test' })
    expect(err).toBeInstanceOf(PQSafeError)
    expect(err).toBeInstanceOf(RevocationError)
  })

  it('RailError is instanceof PQSafeError and RailError', () => {
    const err = new RailError({ code: 'RAIL_PAYMENT_DECLINED', human_reason: 'test' })
    expect(err).toBeInstanceOf(PQSafeError)
    expect(err).toBeInstanceOf(RailError)
  })

  it('RateLimitError is instanceof PQSafeError and RateLimitError', () => {
    const err = new RateLimitError({ code: 'RATE_LIMIT_ISSUER_API', human_reason: 'test' })
    expect(err).toBeInstanceOf(PQSafeError)
    expect(err).toBeInstanceOf(RateLimitError)
  })

  it('AuthError is instanceof PQSafeError and AuthError', () => {
    const err = new AuthError({ code: 'AUTH_API_KEY_INVALID', human_reason: 'test' })
    expect(err).toBeInstanceOf(PQSafeError)
    expect(err).toBeInstanceOf(AuthError)
  })
})

describe('PQSafeError factory helpers', () => {
  it('signatureInvalidError produces correct code + class', () => {
    const err = signatureInvalidError({ envelopeId: '0xabc' })
    expect(err.code).toBe('SIGNATURE_INVALID')
    expect(err.error_class).toBe('SIGNATURE')
    expect(err.is_retriable).toBe(false)
    expect(err.context['envelopeId']).toBe('0xabc')
  })

  it('recipientNotAllowedError carries recipient and allowed list in context', () => {
    const err = recipientNotAllowedError('ATTACKER', ['GOOD_IBAN'])
    expect(err.code).toBe('POLICY_RECIPIENT_NOT_ALLOWED')
    expect(err.context['recipient']).toBe('ATTACKER')
    expect(Array.isArray(err.context['allowedRecipients'])).toBe(true)
  })

  it('amountExceedsCeilingError carries amounts in context', () => {
    const err = amountExceedsCeilingError(250, 200, 'USD')
    expect(err.code).toBe('POLICY_AMOUNT_EXCEEDS_CEILING')
    expect(err.context['requested']).toBe(250)
    expect(err.context['ceiling']).toBe(200)
    expect(err.context['currency']).toBe('USD')
  })

  it('envelopeExpiredError carries expiry context and positive expiredSecondsAgo', () => {
    const validUntil = 1_700_000_000
    const now = 1_700_003_600
    const err = envelopeExpiredError(validUntil, now)
    expect(err.code).toBe('ENVELOPE_EXPIRED')
    expect(err.context['expiredSecondsAgo']).toBe(3600)
  })

  it('envelopeNotYetActiveError carries activatesInSeconds in context', () => {
    const validFrom = 1_700_003_600
    const now = 1_700_000_000
    const err = envelopeNotYetActiveError(validFrom, now)
    expect(err.code).toBe('ENVELOPE_NOT_YET_ACTIVE')
    expect(err.context['activatesInSeconds']).toBe(3600)
  })

  it('cause chain is preserved', () => {
    const root = new Error('root cause')
    const err = new PQSafeError({
      code: 'INTERNAL_UNEXPECTED',
      human_reason: 'wrapper',
      cause: root,
    })
    expect((err as unknown as { cause: unknown }).cause).toBe(root)
  })
})
