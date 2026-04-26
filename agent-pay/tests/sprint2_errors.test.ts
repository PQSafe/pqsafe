/**
 * Sprint 2 — PQSafeError hierarchy test suite
 *
 * Tests the fully-implemented errors.ts module.
 * Stubs (policy, revocation, issuer) are not tested here — they throw NOT_IMPL.
 *
 * Run: tsx tests/sprint2_errors.test.ts
 */

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
} from '../src/sprint2/errors.js'

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const failures: Array<{ name: string; err: string }> = []

function test(name: string, fn: () => void) {
  try {
    fn()
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('')
console.log('\x1b[35m\x1b[1m  PQSafe Sprint 2 — PQSafeError hierarchy\x1b[0m')
console.log('\x1b[90m  Structured error classification, instanceof, toJSON\x1b[0m')
console.log('')

// --- Base class ---

test('PQSafeError is instanceof Error', () => {
  const err = new PQSafeError({
    code: 'INTERNAL_UNEXPECTED',
    human_reason: 'Something went wrong',
  })
  assert(err instanceof Error, 'should be instanceof Error')
  assert(err instanceof PQSafeError, 'should be instanceof PQSafeError')
})

test('PQSafeError.name is PQSafeError', () => {
  const err = new PQSafeError({ code: 'INTERNAL_UNEXPECTED', human_reason: 'test' })
  assert(err.name === 'PQSafeError', `name should be PQSafeError, got ${err.name}`)
})

test('PQSafeError.message includes code and human_reason', () => {
  const err = new PQSafeError({
    code: 'SIGNATURE_INVALID',
    human_reason: 'tampered envelope',
  })
  assert(err.message.includes('SIGNATURE_INVALID'), 'message should include code')
  assert(err.message.includes('tampered envelope'), 'message should include human_reason')
})

test('PQSafeError maps code to correct error_class', () => {
  const cases: Array<[import('../src/sprint2/errors.js').PQSafeErrorCode, import('../src/sprint2/errors.js').ErrorClass]> = [
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
    assert(
      err.error_class === expectedClass,
      `${code} → expected ${expectedClass}, got ${err.error_class}`,
    )
  }
})

test('SIGNATURE errors are never retriable', () => {
  const err = new PQSafeError({ code: 'SIGNATURE_INVALID', human_reason: 'test' })
  assert(err.is_retriable === false, 'signature errors must not be retriable')
})

test('POLICY errors are never retriable', () => {
  const err = new PQSafeError({ code: 'POLICY_AMOUNT_EXCEEDS_CEILING', human_reason: 'test' })
  assert(err.is_retriable === false, 'policy errors must not be retriable')
})

test('REVOCATION errors are never retriable', () => {
  const err = new PQSafeError({ code: 'REVOKED_EPOCH_ADVANCED', human_reason: 'test' })
  assert(err.is_retriable === false, 'revocation errors must not be retriable')
})

test('RAIL_CONNECTION_FAILED is retriable', () => {
  const err = new PQSafeError({ code: 'RAIL_CONNECTION_FAILED', human_reason: 'test' })
  assert(err.is_retriable === true, 'RAIL_CONNECTION_FAILED should be retriable')
})

test('RATE_LIMIT_ISSUER_API is retriable with retry_after_ms', () => {
  const err = new PQSafeError({
    code: 'RATE_LIMIT_ISSUER_API',
    human_reason: 'Too many requests',
    retry_after_ms: 5000,
  })
  assert(err.is_retriable === true, 'rate limit should be retriable')
  assert(err.retry_after_ms === 5000, 'retry_after_ms should be 5000')
})

test('AUTH errors are not retriable', () => {
  const err = new PQSafeError({ code: 'AUTH_API_KEY_INVALID', human_reason: 'bad key' })
  assert(err.is_retriable === false, 'auth errors must not be retriable')
})

test('context field defaults to empty object', () => {
  const err = new PQSafeError({ code: 'INTERNAL_UNEXPECTED', human_reason: 'test' })
  assert(typeof err.context === 'object', 'context should be an object')
  assert(Object.keys(err.context).length === 0, 'context should default to {}')
})

test('context field carries structured data', () => {
  const err = new PQSafeError({
    code: 'POLICY_AMOUNT_EXCEEDS_CEILING',
    human_reason: 'test',
    context: { requested: 250, ceiling: 200, currency: 'USD' },
  })
  assert(err.context['requested'] === 250, 'context.requested should be 250')
  assert(err.context['currency'] === 'USD', 'context.currency should be USD')
})

test('toJSON returns all structured fields', () => {
  const err = new PQSafeError({
    code: 'SIGNATURE_INVALID',
    human_reason: 'tampered',
    context: { envelopeId: 'abc' },
  })
  const j = err.toJSON()
  assert(j['error_class'] === 'SIGNATURE', 'toJSON.error_class')
  assert(j['code'] === 'SIGNATURE_INVALID', 'toJSON.code')
  assert(j['is_retriable'] === false, 'toJSON.is_retriable')
  assert(j['human_reason'] === 'tampered', 'toJSON.human_reason')
  assert((j['context'] as Record<string, unknown>)['envelopeId'] === 'abc', 'toJSON.context.envelopeId')
})

// --- Subclasses ---

test('SignatureError is instanceof PQSafeError and SignatureError', () => {
  const err = new SignatureError({ code: 'SIGNATURE_INVALID', human_reason: 'test' })
  assert(err instanceof PQSafeError, 'should be instanceof PQSafeError')
  assert(err instanceof SignatureError, 'should be instanceof SignatureError')
  assert(err.name === 'SignatureError', `name should be SignatureError, got ${err.name}`)
})

test('PolicyError is instanceof PQSafeError and PolicyError', () => {
  const err = new PolicyError({ code: 'POLICY_RECIPIENT_NOT_ALLOWED', human_reason: 'test' })
  assert(err instanceof PQSafeError, 'should be instanceof PQSafeError')
  assert(err instanceof PolicyError, 'should be instanceof PolicyError')
  assert(err.name === 'PolicyError', `name should be PolicyError, got ${err.name}`)
})

test('TemporalError is instanceof PQSafeError and TemporalError', () => {
  const err = new TemporalError({ code: 'ENVELOPE_EXPIRED', human_reason: 'test' })
  assert(err instanceof PQSafeError, 'should be instanceof PQSafeError')
  assert(err instanceof TemporalError, 'should be instanceof TemporalError')
})

test('RevocationError is instanceof PQSafeError and RevocationError', () => {
  const err = new RevocationError({ code: 'REVOKED_EPOCH_ADVANCED', human_reason: 'test' })
  assert(err instanceof PQSafeError, 'should be instanceof PQSafeError')
  assert(err instanceof RevocationError, 'should be instanceof RevocationError')
})

test('RailError is instanceof PQSafeError and RailError', () => {
  const err = new RailError({ code: 'RAIL_PAYMENT_DECLINED', human_reason: 'test' })
  assert(err instanceof PQSafeError, 'should be instanceof PQSafeError')
  assert(err instanceof RailError, 'should be instanceof RailError')
})

test('RateLimitError is instanceof PQSafeError and RateLimitError', () => {
  const err = new RateLimitError({ code: 'RATE_LIMIT_ISSUER_API', human_reason: 'test' })
  assert(err instanceof PQSafeError, 'should be instanceof PQSafeError')
  assert(err instanceof RateLimitError, 'should be instanceof RateLimitError')
})

test('AuthError is instanceof PQSafeError and AuthError', () => {
  const err = new AuthError({ code: 'AUTH_API_KEY_INVALID', human_reason: 'test' })
  assert(err instanceof PQSafeError, 'should be instanceof PQSafeError')
  assert(err instanceof AuthError, 'should be instanceof AuthError')
})

// --- Factory helpers ---

test('signatureInvalidError produces correct code + class', () => {
  const err = signatureInvalidError({ envelopeId: '0xabc' })
  assert(err.code === 'SIGNATURE_INVALID', 'code mismatch')
  assert(err.error_class === 'SIGNATURE', 'class mismatch')
  assert(err.is_retriable === false, 'should not be retriable')
  assert(err.context['envelopeId'] === '0xabc', 'context envelopeId')
})

test('recipientNotAllowedError carries recipient and allowed list in context', () => {
  const err = recipientNotAllowedError('ATTACKER', ['GOOD_IBAN'])
  assert(err.code === 'POLICY_RECIPIENT_NOT_ALLOWED', 'code mismatch')
  assert(err.context['recipient'] === 'ATTACKER', 'context.recipient')
  assert(
    Array.isArray(err.context['allowedRecipients']),
    'context.allowedRecipients should be array',
  )
})

test('amountExceedsCeilingError carries amounts in context', () => {
  const err = amountExceedsCeilingError(250, 200, 'USD')
  assert(err.code === 'POLICY_AMOUNT_EXCEEDS_CEILING', 'code mismatch')
  assert(err.context['requested'] === 250, 'context.requested')
  assert(err.context['ceiling'] === 200, 'context.ceiling')
  assert(err.context['currency'] === 'USD', 'context.currency')
})

test('envelopeExpiredError carries expiry context and positive expiredSecondsAgo', () => {
  const validUntil = 1_700_000_000
  const now = 1_700_003_600
  const err = envelopeExpiredError(validUntil, now)
  assert(err.code === 'ENVELOPE_EXPIRED', 'code mismatch')
  assert(err.context['expiredSecondsAgo'] === 3600, 'expiredSecondsAgo should be 3600')
})

test('envelopeNotYetActiveError carries activatesInSeconds in context', () => {
  const validFrom = 1_700_003_600
  const now = 1_700_000_000
  const err = envelopeNotYetActiveError(validFrom, now)
  assert(err.code === 'ENVELOPE_NOT_YET_ACTIVE', 'code mismatch')
  assert(err.context['activatesInSeconds'] === 3600, 'activatesInSeconds should be 3600')
})

test('cause chain is preserved', () => {
  const root = new Error('root cause')
  const err = new PQSafeError({
    code: 'INTERNAL_UNEXPECTED',
    human_reason: 'wrapper',
    cause: root,
  })
  // Node ≥16.9 supports Error.cause — cast to access it
  assert((err as unknown as { cause: unknown }).cause === root, 'cause should be preserved')
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

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
  console.log('  \x1b[32mAll Sprint 2 error guardrails held.\x1b[0m')
  console.log('')
}
