/**
 * Sprint 2 — PQSafeError structured error hierarchy.
 *
 * IMPLEMENTATION STATUS: FULLY IMPLEMENTED.
 *
 * Motivation (from external FI review):
 *   Raw Error("PQSafe: ...") strings are not machine-parseable. FI integrations
 *   require structured errors for:
 *     - Circuit-breaker logic (is_retriable + retry_after_ms)
 *     - Incident triage (error_class categorization)
 *     - Compliance audit trails (human_reason + context fields)
 *     - SDK consumer error handling without string matching
 *
 * Usage:
 *   throw new PQSafeError({
 *     code: 'ENVELOPE_EXPIRED',
 *     human_reason: 'The spend envelope expired 3 minutes ago.',
 *     context: { validUntil: 1712345678, now: 1712345858 },
 *   })
 *
 *   catch (err) {
 *     if (err instanceof PQSafeError && err.is_retriable) {
 *       await sleep(err.retry_after_ms ?? 1000)
 *       retry()
 *     }
 *   }
 */

// ---------------------------------------------------------------------------
// Error class enumeration
// ---------------------------------------------------------------------------

/**
 * Broad category of error. Used for routing, alerting, and dashboard grouping.
 *
 *   SIGNATURE    — cryptographic verification failures (never retriable)
 *   POLICY       — spend policy / allowlist / amount violations (never retriable without new envelope)
 *   TEMPORAL     — envelope time-window issues (may be retriable with a new envelope)
 *   REVOCATION   — envelope revoked at any layer (never retriable)
 *   RAIL         — downstream payment rail failure (may be retriable)
 *   RATE_LIMIT   — hosted issuer API rate limit hit (retriable after retry_after_ms)
 *   AUTH         — API key / authentication failure (not retriable without new credentials)
 *   INTERNAL     — unexpected internal error (retry with backoff, escalate if persistent)
 *   NOT_IMPL     — called a stub function not yet implemented (developer error)
 */
export type ErrorClass =
  | 'SIGNATURE'
  | 'POLICY'
  | 'TEMPORAL'
  | 'REVOCATION'
  | 'RAIL'
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'INTERNAL'
  | 'NOT_IMPL'

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/**
 * Fine-grained error code. Each code maps to exactly one ErrorClass.
 * Codes are stable identifiers — safe for programmatic matching.
 */
export type PQSafeErrorCode =
  // SIGNATURE errors
  | 'SIGNATURE_INVALID'
  | 'SIGNATURE_KEY_MISMATCH'
  | 'SIGNATURE_MALFORMED'

  // POLICY errors
  | 'POLICY_RECIPIENT_NOT_ALLOWED'
  | 'POLICY_AMOUNT_EXCEEDS_CEILING'
  | 'POLICY_AMOUNT_EXCEEDS_PER_TX_CAP'
  | 'POLICY_CUMULATIVE_CAP_EXHAUSTED'
  | 'POLICY_SINGLE_USE_ALREADY_SPENT'
  | 'POLICY_RAIL_NOT_ALLOWED'
  | 'POLICY_CURRENCY_MISMATCH'

  // TEMPORAL errors
  | 'ENVELOPE_NOT_YET_ACTIVE'
  | 'ENVELOPE_EXPIRED'

  // REVOCATION errors
  | 'REVOKED_EPOCH_ADVANCED'
  | 'REVOKED_GRANULAR'
  | 'REVOCATION_CHECK_FAILED_CLOSED'

  // RAIL errors
  | 'RAIL_CONNECTION_FAILED'
  | 'RAIL_PAYMENT_DECLINED'
  | 'RAIL_SETTLEMENT_PENDING'
  | 'RAIL_UNSUPPORTED'
  | 'RAIL_RECIPIENT_INVALID'

  // RATE_LIMIT errors
  | 'RATE_LIMIT_ISSUER_API'
  | 'RATE_LIMIT_ENVELOPE_CREATION'

  // AUTH errors
  | 'AUTH_API_KEY_INVALID'
  | 'AUTH_API_KEY_REVOKED'
  | 'AUTH_INSUFFICIENT_SCOPE'

  // INTERNAL errors
  | 'INTERNAL_SCHEMA_INVALID'
  | 'INTERNAL_UNEXPECTED'

  // NOT_IMPL errors
  | 'NOT_IMPLEMENTED'

// ---------------------------------------------------------------------------
// Error class lookup table
// ---------------------------------------------------------------------------

const ERROR_CLASS_MAP: Record<PQSafeErrorCode, ErrorClass> = {
  SIGNATURE_INVALID:              'SIGNATURE',
  SIGNATURE_KEY_MISMATCH:         'SIGNATURE',
  SIGNATURE_MALFORMED:            'SIGNATURE',

  POLICY_RECIPIENT_NOT_ALLOWED:   'POLICY',
  POLICY_AMOUNT_EXCEEDS_CEILING:  'POLICY',
  POLICY_AMOUNT_EXCEEDS_PER_TX_CAP: 'POLICY',
  POLICY_CUMULATIVE_CAP_EXHAUSTED: 'POLICY',
  POLICY_SINGLE_USE_ALREADY_SPENT: 'POLICY',
  POLICY_RAIL_NOT_ALLOWED:        'POLICY',
  POLICY_CURRENCY_MISMATCH:       'POLICY',

  ENVELOPE_NOT_YET_ACTIVE:        'TEMPORAL',
  ENVELOPE_EXPIRED:               'TEMPORAL',

  REVOKED_EPOCH_ADVANCED:         'REVOCATION',
  REVOKED_GRANULAR:               'REVOCATION',
  REVOCATION_CHECK_FAILED_CLOSED: 'REVOCATION',

  RAIL_CONNECTION_FAILED:         'RAIL',
  RAIL_PAYMENT_DECLINED:          'RAIL',
  RAIL_SETTLEMENT_PENDING:        'RAIL',
  RAIL_UNSUPPORTED:               'RAIL',
  RAIL_RECIPIENT_INVALID:         'RAIL',

  RATE_LIMIT_ISSUER_API:          'RATE_LIMIT',
  RATE_LIMIT_ENVELOPE_CREATION:   'RATE_LIMIT',

  AUTH_API_KEY_INVALID:           'AUTH',
  AUTH_API_KEY_REVOKED:           'AUTH',
  AUTH_INSUFFICIENT_SCOPE:        'AUTH',

  INTERNAL_SCHEMA_INVALID:        'INTERNAL',
  INTERNAL_UNEXPECTED:            'INTERNAL',

  NOT_IMPLEMENTED:                'NOT_IMPL',
}

// ---------------------------------------------------------------------------
// Retry-ability table
// ---------------------------------------------------------------------------

/**
 * Whether a given error code represents a retriable condition.
 * SIGNATURE, POLICY, REVOCATION, AUTH errors are NEVER retriable
 * (a new envelope or new credentials are required).
 * RAIL, RATE_LIMIT, INTERNAL errors may be retriable.
 */
const RETRIABLE_CODES = new Set<PQSafeErrorCode>([
  'RAIL_CONNECTION_FAILED',
  'RAIL_SETTLEMENT_PENDING',
  'RATE_LIMIT_ISSUER_API',
  'RATE_LIMIT_ENVELOPE_CREATION',
  'INTERNAL_UNEXPECTED',
])

// ---------------------------------------------------------------------------
// PQSafeError params
// ---------------------------------------------------------------------------

export interface PQSafeErrorParams {
  /** Fine-grained error code. */
  code: PQSafeErrorCode
  /**
   * Human-readable explanation safe for logging and operator dashboards.
   * Do NOT include PII or secret key material here.
   */
  human_reason: string
  /**
   * Structured context for programmatic inspection (amounts, addresses, etc.).
   * All values must be JSON-serializable.
   */
  context?: Record<string, unknown>
  /**
   * If retriable, how long the caller should wait before retrying (milliseconds).
   * Provided for RATE_LIMIT errors (parsed from Retry-After header).
   * For other retriable errors, use exponential backoff with this as the floor.
   */
  retry_after_ms?: number
  /**
   * Optional: the underlying cause (for error chaining).
   */
  cause?: Error
}

// ---------------------------------------------------------------------------
// PQSafeError base class
// ---------------------------------------------------------------------------

/**
 * Structured error base class for all PQSafe AgentPay errors.
 *
 * All errors thrown by Sprint 2+ code (and progressively migrated from Sprint 1)
 * will be instances of PQSafeError or a subclass.
 *
 * @example
 * ```ts
 * try {
 *   await executeAgentPayment(signed, request)
 * } catch (err) {
 *   if (err instanceof PQSafeError) {
 *     console.log(err.error_class)     // 'POLICY'
 *     console.log(err.code)            // 'POLICY_AMOUNT_EXCEEDS_CEILING'
 *     console.log(err.is_retriable)    // false
 *     console.log(err.human_reason)    // 'Requested amount 250 USD exceeds...'
 *     console.log(err.context)         // { requested: 250, ceiling: 200 }
 *   }
 * }
 * ```
 */
export class PQSafeError extends Error {
  /** Broad category of error. Use for routing and alerting. */
  readonly error_class: ErrorClass
  /** Fine-grained stable error code. Safe for programmatic matching. */
  readonly code: PQSafeErrorCode
  /** Whether the same call may succeed if retried (after delay or new envelope). */
  readonly is_retriable: boolean
  /** Minimum wait before retry (ms). Undefined if not retriable. */
  readonly retry_after_ms: number | undefined
  /** Operator-readable explanation. */
  readonly human_reason: string
  /** Structured context for inspection. */
  readonly context: Record<string, unknown>

  constructor(params: PQSafeErrorParams) {
    const message = `[${params.code}] ${params.human_reason}`
    super(message, params.cause ? { cause: params.cause } : undefined)
    this.name = 'PQSafeError'

    this.code = params.code
    this.error_class = ERROR_CLASS_MAP[params.code]
    this.is_retriable = RETRIABLE_CODES.has(params.code)
    this.retry_after_ms = params.retry_after_ms
    this.human_reason = params.human_reason
    this.context = params.context ?? {}
  }

  /** Serialize to a JSON-safe object (for API responses and structured logging). */
  toJSON(): Record<string, unknown> {
    return {
      error_class: this.error_class,
      code: this.code,
      is_retriable: this.is_retriable,
      retry_after_ms: this.retry_after_ms,
      human_reason: this.human_reason,
      context: this.context,
    }
  }
}

// ---------------------------------------------------------------------------
// Typed subclasses (one per error_class)
// ---------------------------------------------------------------------------

/** Thrown when ML-DSA signature verification fails. Never retriable. */
export class SignatureError extends PQSafeError {
  constructor(params: Omit<PQSafeErrorParams, 'code'> & { code: Extract<PQSafeErrorCode, `SIGNATURE_${string}`> }) {
    super(params)
    this.name = 'SignatureError'
  }
}

/** Thrown when spend policy is violated. Never retriable without a new envelope. */
export class PolicyError extends PQSafeError {
  constructor(params: Omit<PQSafeErrorParams, 'code'> & { code: Extract<PQSafeErrorCode, `POLICY_${string}`> }) {
    super(params)
    this.name = 'PolicyError'
  }
}

/** Thrown when an envelope is outside its validity window. */
export class TemporalError extends PQSafeError {
  constructor(params: Omit<PQSafeErrorParams, 'code'> & { code: Extract<PQSafeErrorCode, 'ENVELOPE_NOT_YET_ACTIVE' | 'ENVELOPE_EXPIRED'> }) {
    super(params)
    this.name = 'TemporalError'
  }
}

/** Thrown when an envelope has been revoked via any layer. Never retriable. */
export class RevocationError extends PQSafeError {
  constructor(params: Omit<PQSafeErrorParams, 'code'> & { code: Extract<PQSafeErrorCode, `REVOKED_${string}` | 'REVOCATION_CHECK_FAILED_CLOSED'> }) {
    super(params)
    this.name = 'RevocationError'
  }
}

/** Thrown when the downstream payment rail fails. May be retriable. */
export class RailError extends PQSafeError {
  constructor(params: Omit<PQSafeErrorParams, 'code'> & { code: Extract<PQSafeErrorCode, `RAIL_${string}`> }) {
    super(params)
    this.name = 'RailError'
  }
}

/** Thrown when the hosted issuer API rate limit is hit. Retriable after retry_after_ms. */
export class RateLimitError extends PQSafeError {
  constructor(params: Omit<PQSafeErrorParams, 'code'> & { code: Extract<PQSafeErrorCode, `RATE_LIMIT_${string}`> }) {
    super(params)
    this.name = 'RateLimitError'
  }
}

/** Thrown for authentication / API key issues. Not retriable without new credentials. */
export class AuthError extends PQSafeError {
  constructor(params: Omit<PQSafeErrorParams, 'code'> & { code: Extract<PQSafeErrorCode, `AUTH_${string}`> }) {
    super(params)
    this.name = 'AuthError'
  }
}

// ---------------------------------------------------------------------------
// Factory helpers (convenience for common cases)
// ---------------------------------------------------------------------------

/** Create a SignatureError for failed ML-DSA-65 verification. */
export function signatureInvalidError(context?: Record<string, unknown>): SignatureError {
  return new SignatureError({
    code: 'SIGNATURE_INVALID',
    human_reason: 'ML-DSA-65 signature verification failed. The envelope has been tampered with or signed by a different key.',
    context,
  })
}

/** Create a PolicyError for recipient not in allowlist. */
export function recipientNotAllowedError(recipient: string, allowed: string[]): PolicyError {
  return new PolicyError({
    code: 'POLICY_RECIPIENT_NOT_ALLOWED',
    human_reason: `Recipient "${recipient}" is not in the envelope allowlist.`,
    context: { recipient, allowedRecipients: allowed },
  })
}

/** Create a PolicyError for amount exceeding envelope ceiling. */
export function amountExceedsCeilingError(requested: number, ceiling: number, currency: string): PolicyError {
  return new PolicyError({
    code: 'POLICY_AMOUNT_EXCEEDS_CEILING',
    human_reason: `Requested amount ${requested} ${currency} exceeds envelope maxAmount ${ceiling} ${currency}.`,
    context: { requested, ceiling, currency },
  })
}

/** Create a TemporalError for an expired envelope. */
export function envelopeExpiredError(validUntil: number, now: number): TemporalError {
  return new TemporalError({
    code: 'ENVELOPE_EXPIRED',
    human_reason: `Envelope expired ${now - validUntil} seconds ago. Issue a new envelope.`,
    context: { validUntil, now, expiredSecondsAgo: now - validUntil },
  })
}

/** Create a TemporalError for an envelope not yet active. */
export function envelopeNotYetActiveError(validFrom: number, now: number): TemporalError {
  return new TemporalError({
    code: 'ENVELOPE_NOT_YET_ACTIVE',
    human_reason: `Envelope activates in ${validFrom - now} seconds.`,
    context: { validFrom, now, activatesInSeconds: validFrom - now },
  })
}

// ---------------------------------------------------------------------------
// Sprint 2 — Revocation-specific error subclasses
// ---------------------------------------------------------------------------

export interface EnvelopeRevokedErrorParams {
  envelopeHash: string
  revokedAt?: string
  reason?: string
}

/**
 * Thrown when a per-envelope revocation record exists (Layer 3).
 * The envelope has been explicitly revoked; never retriable.
 */
export class EnvelopeRevokedError extends RevocationError {
  readonly envelopeHash: string
  readonly revokedAt: string | undefined

  constructor(params: EnvelopeRevokedErrorParams) {
    super({
      code: 'REVOKED_GRANULAR',
      human_reason:
        `Envelope ${params.envelopeHash} has been revoked` +
        (params.revokedAt ? ` at ${params.revokedAt}` : '') +
        (params.reason ? `: ${params.reason}` : '.'),
      context: {
        envelopeHash: params.envelopeHash,
        revokedAt: params.revokedAt ?? null,
        reason: params.reason ?? null,
      },
    })
    this.name = 'EnvelopeRevokedError'
    this.envelopeHash = params.envelopeHash
    this.revokedAt = params.revokedAt
  }
}

export interface EpochInvalidatedErrorParams {
  issuerAddress: string
  envelopeEpoch: bigint
  currentEpoch: bigint
}

/**
 * Thrown when the issuer has advanced their epoch beyond the envelope's epoch (Layer 2).
 * All envelopes from this issuer under the old epoch are bulk-invalidated.
 * Never retriable — a new envelope under the current epoch is required.
 */
export class EpochInvalidatedError extends RevocationError {
  readonly issuerAddress: string
  readonly envelopeEpoch: bigint
  readonly currentEpoch: bigint

  constructor(params: EpochInvalidatedErrorParams) {
    super({
      code: 'REVOKED_EPOCH_ADVANCED',
      human_reason:
        `Issuer ${params.issuerAddress} advanced epoch to ${params.currentEpoch}. ` +
        `Envelope was signed under epoch ${params.envelopeEpoch}. Issue a new envelope.`,
      context: {
        issuerAddress: params.issuerAddress,
        envelopeEpoch: params.envelopeEpoch.toString(),
        currentEpoch: params.currentEpoch.toString(),
      },
    })
    this.name = 'EpochInvalidatedError'
    this.issuerAddress = params.issuerAddress
    this.envelopeEpoch = params.envelopeEpoch
    this.currentEpoch = params.currentEpoch
  }
}

export interface EnvelopeExpiredErrorParams {
  envelopeHash?: string
  validUntil: number
  now: number
}

/**
 * Thrown when an envelope's validUntil timestamp has passed (Layer 1 / TTL).
 * May be resolved by issuing a new envelope. Not retriable with the same envelope.
 */
export class EnvelopeExpiredError extends TemporalError {
  readonly validUntil: number

  constructor(params: EnvelopeExpiredErrorParams) {
    const expiredAgo = params.now - params.validUntil
    super({
      code: 'ENVELOPE_EXPIRED',
      human_reason:
        `Envelope expired ${expiredAgo} second(s) ago (validUntil=${params.validUntil}).`,
      context: {
        envelopeHash: params.envelopeHash ?? null,
        validUntil: params.validUntil,
        now: params.now,
        expiredSecondsAgo: expiredAgo,
      },
    })
    this.name = 'EnvelopeExpiredError'
    this.validUntil = params.validUntil
  }
}
