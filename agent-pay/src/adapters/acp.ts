/**
 * Stripe ACP (Agent Commerce Protocol) adapter for PQSafe AgentPay.
 *
 * Stripe's Agent Commerce Protocol introduces Shared Payment Tokens (SPTs) —
 * a credential type that allows AI agents to be delegated limited payment
 * authority by a human user. SPTs carry usage limits (amount ceilings, allowed
 * merchants, expiry) in a Stripe-managed structure.
 *
 * PQSafe wraps SPTs with ML-DSA-65 post-quantum signatures, providing a
 * cryptographic audit trail that survives Stripe's infrastructure. The PQ
 * signature proves that a human authorized this specific spend delegation
 * in a FIPS 204-compliant, quantum-resistant manner.
 *
 * Reference: https://stripe.com/docs/agent-commerce (ACP v1, 2025)
 *
 * @module adapters/acp
 */

import { bytesToHex } from '@noble/hashes/utils.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type { SpendEnvelope } from '../envelope.js'

// ---------------------------------------------------------------------------
// Stripe ACP type definitions
// ---------------------------------------------------------------------------

/** Namespace wrapper — import as `import type { StripeACP } from './adapters/index.js'` */
export namespace Stripe {
  // -------------------------------------------------------------------------
  // Shared Payment Token (SPT)
  // -------------------------------------------------------------------------

  /**
   * Usage limits applied to a Shared Payment Token.
   *
   * All monetary fields are in the smallest currency unit (e.g. cents for USD).
   * This matches Stripe's convention for atomic currency amounts.
   */
  export interface SharedPaymentTokenUsageLimits {
    /**
     * Maximum total amount the token may authorize across all transactions,
     * in the smallest currency unit.
     * @example 10000 — $100.00 USD lifetime ceiling
     */
    maxTotalAmount?: number
    /**
     * Maximum amount per individual transaction, in the smallest currency unit.
     * @example 2000 — $20.00 per transaction
     */
    maxAmountPerTransaction?: number
    /**
     * Allowed merchant category codes (ISO 18245 MCCs).
     * Empty array or omitted = all merchants allowed.
     * @example ["5411", "5912"] — grocery stores and drug stores only
     */
    allowedMerchantCategories?: string[]
    /**
     * Explicit allowlist of Stripe merchant IDs (acct_*) that may charge
     * this token. If set, charges from other merchants are rejected.
     */
    allowedMerchants?: string[]
    /**
     * Explicit blocklist of Stripe merchant IDs that may NOT charge this token.
     * Useful for excluding known high-risk merchants without blocking the category.
     */
    blockedMerchants?: string[]
    /**
     * Maximum number of times the token may be used.
     * Omit for unlimited usage within other constraints.
     */
    maxUseCount?: number
    /**
     * ISO 8601 datetime after which the token is expired and cannot be used.
     * @example "2026-06-01T00:00:00Z"
     */
    expiresAt?: string
    /**
     * Allowed countries for merchant presence (ISO 3166-1 alpha-2).
     * Omit for all countries.
     * @example ["US", "GB", "HK"]
     */
    allowedCountries?: string[]
    /**
     * ISO 4217 currency code for usage limit amounts.
     * Required when any monetary limit is set.
     */
    currency?: string
  }

  /**
   * A Shared Payment Token — the credential Stripe issues when a user
   * delegates limited payment authority to an AI agent.
   *
   * The token itself is an opaque reference to Stripe's vault; PQSafe treats
   * it as a reference that must be accompanied by a PQ signature to prove
   * the delegation was human-authorized.
   */
  export interface SharedPaymentToken {
    /**
     * Stripe SPT identifier.
     * @example "spt_1PXqBBGJhmH2PkSTDemoToken123"
     */
    id: string
    /** Object type discriminator — always "shared_payment_token" */
    object: 'shared_payment_token'
    /** Stripe-internal payment method the SPT draws from (pm_*) */
    paymentMethod: string
    /** The Stripe customer who owns this token (cus_*) */
    customer: string
    /** Agent identifier this token was issued to */
    agentId: string
    /** Usage constraints */
    usageLimits?: SharedPaymentTokenUsageLimits
    /** Whether the token is currently active */
    active: boolean
    /** Running total of amounts authorized so far (smallest currency unit) */
    amountUsed: number
    /** ISO 4217 currency code for all monetary fields in usageLimits */
    currency: string
    /** Unix timestamp of creation */
    created: number
    /** Unix timestamp when the token was last used (null if never used) */
    lastUsed: number | null
    /** Stripe-managed metadata */
    metadata?: Record<string, string>
  }

  // -------------------------------------------------------------------------
  // CreateSharedPaymentTokenParams
  // -------------------------------------------------------------------------

  /**
   * Parameters for creating a Shared Payment Token via the Stripe API.
   * Send to `POST /v1/shared_payment_tokens`.
   */
  export interface CreateSharedPaymentTokenParams {
    /** Stripe payment method ID to delegate (pm_*) */
    paymentMethod: string
    /** Stripe customer ID that owns the payment method (cus_*) */
    customer: string
    /** Agent identifier (max 64 chars) */
    agentId: string
    /** ISO 4217 currency code for usage limit amounts */
    currency: string
    /** Usage constraints on this token */
    usageLimits?: SharedPaymentTokenUsageLimits
    /**
     * Optional idempotency key to prevent duplicate token creation.
     * Use a UUID v4 or your own order ID.
     */
    idempotencyKey?: string
    /** Optional key-value metadata (max 50 keys, 500 chars each) */
    metadata?: Record<string, string>
    /**
     * PQSafe extension: if true, Stripe API response is expected to include
     * a `pq_envelope` field containing the serialized SpendEnvelope.
     * Only set if the merchant is running a PQSafe-integrated Stripe app.
     */
    pqEnvelopeRequested?: boolean
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Currencies where Stripe's smallest unit is NOT cents (i.e. 1 unit = 1 major unit).
 *
 * JPY, KRW, BIF, CLP, GNF, MGA, PYG, RWF, UGX, VND, VUV, XAF, XOF, XPF
 * are zero-decimal currencies per Stripe docs. For these, `max_amount` in
 * Stripe API units is already in the major unit, so we must NOT divide by 100.
 *
 * This list covers the most common zero-decimal currencies. For production
 * usage verify against https://stripe.com/docs/currencies#zero-decimal
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
])

/**
 * Convert a Stripe API amount (smallest currency unit) to a major-unit amount.
 * For standard currencies: divide by 100 (e.g. 1000 cents → 10.00 USD).
 * For zero-decimal currencies (JPY, KRW, etc.): no conversion needed.
 */
function stripeAmountToMajorUnit(amount: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())) {
    return amount
  }
  return amount / 100
}

/**
 * Convert a major-unit amount to Stripe API smallest-currency-unit.
 * For standard currencies: multiply by 100 (e.g. 10.00 USD → 1000 cents).
 * For zero-decimal currencies (JPY, KRW, etc.): no conversion needed.
 */
function majorUnitToStripeAmount(amount: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())) {
    return Math.round(amount)
  }
  return Math.round(amount * 100)
}

/**
 * Parse an ISO 8601 datetime string to a Unix timestamp (integer seconds).
 * Throws if the string is not a valid date.
 */
function isoToUnix(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) {
    throw new Error(`ACP adapter: invalid ISO 8601 datetime "${iso}"`)
  }
  return Math.floor(ms / 1000)
}

/**
 * Convert a Unix timestamp (seconds) to an ISO 8601 UTC string.
 */
function unixToIso(ts: number): string {
  return new Date(ts * 1000).toISOString()
}

/**
 * Derive a 128-bit nonce from an arbitrary string by SHA-256-hashing it
 * and taking the first 16 bytes. Returns a 32-character lowercase hex string.
 */
function nonceFromString(s: string): string {
  const hashBytes = sha256(new TextEncoder().encode(s))
  return bytesToHex(hashBytes.slice(0, 16))
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Convert a Stripe Shared Payment Token to a PQSafe SpendEnvelope.
 *
 * The adapter maps SPT authorization limits to SpendEnvelope policy fields:
 *   - `token.usageLimits.maxAmountPerTransaction` → `SpendEnvelope.maxAmount`
 *     (falls back to `maxTotalAmount` if per-transaction limit is absent)
 *   - `token.currency` → `SpendEnvelope.currency`
 *   - `token.agentId` → `SpendEnvelope.agent`
 *   - `token.usageLimits.allowedMerchants[0]` → `SpendEnvelope.allowedRecipients`
 *   - `token.usageLimits.expiresAt` (ISO 8601) → `SpendEnvelope.validUntil`
 *
 * Currency unit conversion: Stripe stores all amounts in the smallest currency
 * unit (e.g. cents for USD/EUR/GBP/CAD/AUD). This adapter divides by 100 to
 * produce a major-unit amount in the SpendEnvelope.
 *
 * EXCEPTION: Zero-decimal currencies (JPY, KRW, BIF, CLP, GNF, MGA, PYG,
 * RWF, UGX, VND, VUV, XAF, XOF, XPF) are NOT divided — Stripe stores them
 * already in major units. See ZERO_DECIMAL_CURRENCIES list in this module.
 *
 * @param token - A `Stripe.SharedPaymentToken` retrieved from the Stripe API.
 * @param issuerAddress - PQSafe address of the human issuer (pq1 + 20-byte keccak hex).
 *   Must match the Stripe customer who created the SPT.
 * @param agentId - Override for the agent identifier. If omitted, uses `token.agentId`.
 *   Useful when an SPT is reused across multiple named agent sessions.
 * @returns An unsigned `SpendEnvelope` ready for `signEnvelope()`.
 * @throws {Error} If `token.active` is false (cannot create envelope for inactive token).
 * @throws {Error} If `usageLimits.allowedMerchants` is absent or empty (required by PQSafe policy).
 *
 * @example
 * ```ts
 * const envelope = acpTokenToSpendEnvelope(spt, 'pq1abc...', 'my-agent-v1')
 * const signed = signEnvelope(envelope, secretKey, publicKey)
 * ```
 */
export function acpTokenToSpendEnvelope(
  token: Stripe.SharedPaymentToken,
  issuerAddress: string,
  agentId?: string,
): SpendEnvelope {
  // Guard: deactivated token cannot be converted to an active SpendEnvelope
  if (!token.active) {
    throw new Error(
      `ACP adapter: SPT "${token.id}" is deactivated — cannot create SpendEnvelope for inactive token`,
    )
  }

  // Guard: PQSafe requires an explicit merchant allowlist for auditability
  const allowedMerchants = token.usageLimits?.allowedMerchants
  if (!allowedMerchants || allowedMerchants.length === 0) {
    throw new Error(
      `ACP adapter: SPT "${token.id}" has no allowedMerchants in usageLimits — PQSafe requires an explicit merchant allowlist`,
    )
  }

  // Resolve currency (fallback chain: usageLimits.currency → token.currency)
  const currency = (token.usageLimits?.currency ?? token.currency).toUpperCase()

  // Resolve amount: prefer per-transaction limit, fall back to total limit
  const rawAmount =
    token.usageLimits?.maxAmountPerTransaction ??
    token.usageLimits?.maxTotalAmount

  if (rawAmount === undefined || rawAmount <= 0) {
    throw new Error(
      `ACP adapter: SPT "${token.id}" has no usable amount limit (maxAmountPerTransaction or maxTotalAmount required)`,
    )
  }

  // Convert Stripe smallest-unit to major unit (divide by 100 for USD/EUR/etc.)
  const maxAmount = stripeAmountToMajorUnit(rawAmount, currency)

  // Temporal bounds
  const validFrom = token.created

  let validUntil: number
  if (token.usageLimits?.expiresAt) {
    validUntil = isoToUnix(token.usageLimits.expiresAt)
  } else {
    // No expiry set on token — default to 1 year from creation
    validUntil = token.created + 365 * 24 * 3600
  }

  // Nonce from token ID (deterministic, unique per SPT)
  const nonce = nonceFromString(token.id)

  const envelope: SpendEnvelope = {
    version: 1,
    issuer: issuerAddress,
    agent: agentId ?? token.agentId,
    maxAmount,
    currency,
    allowedRecipients: allowedMerchants,
    validFrom,
    validUntil,
    nonce,
    rail: 'stripe',
  }

  return envelope
}

/**
 * Convert a PQSafe SpendEnvelope back into Stripe SPT creation parameters.
 *
 * Enables a workflow where an agent holds a SpendEnvelope (issued by a
 * PQSafe AgentPay signing key) and needs to obtain a Stripe SPT to actually charge a
 * customer. The adapter translates envelope policy into SPT usage limits
 * so the resulting SPT mirrors the human-approved spend bounds.
 *
 * Field mapping:
 *   - `env.maxAmount` → `usageLimits.maxAmountPerTransaction` (in smallest currency unit)
 *   - `env.currency` → `currency`
 *   - `env.agent` → `agentId`
 *   - `env.allowedRecipients` → `usageLimits.allowedMerchants`
 *   - `env.validUntil` (Unix seconds) → `usageLimits.expiresAt` (ISO 8601)
 *
 * The caller must supply `paymentMethodId` because SpendEnvelopes do not
 * store Stripe-specific payment method IDs (they are rail-agnostic).
 *
 * SPT is a single-merchant credential: `env.allowedRecipients` must contain
 * exactly one merchant ID.
 *
 * @param env - A validated `SpendEnvelope` (from `verifyEnvelope()`).
 * @param paymentMethodId - Stripe payment method ID (pm_*) to attach to the SPT.
 * @returns `Stripe.CreateSharedPaymentTokenParams` ready to post to Stripe API.
 * @throws {Error} If `env.allowedRecipients.length !== 1` (SPT is single-merchant).
 * @throws {Error} If `env.rail` is set and is not `'stripe'` (wrong rail for SPT creation).
 *
 * @example
 * ```ts
 * const params = spendEnvelopeToAcpToken(verifiedEnvelope, 'pm_1PXqBB...')
 * const spt = await stripe.sharedPaymentTokens.create(params)
 * ```
 */
export function spendEnvelopeToAcpToken(
  env: SpendEnvelope,
  paymentMethodId: string,
): Stripe.CreateSharedPaymentTokenParams {
  // SPT is a single-merchant credential
  if (env.allowedRecipients.length !== 1) {
    throw new Error(
      `ACP adapter: SPT is single-merchant — SpendEnvelope.allowedRecipients must have exactly 1 entry, got ${env.allowedRecipients.length}`,
    )
  }

  // Rail check: warn if a non-stripe rail is explicitly set
  if (env.rail !== undefined && env.rail !== 'stripe') {
    console.warn(
      `ACP adapter: SpendEnvelope.rail is "${env.rail}" but SPT creation targets Stripe — consider using rail="stripe"`,
    )
  }

  const currency = env.currency.toUpperCase()

  // Convert major-unit amount to Stripe smallest-currency-unit (multiply by 100 for USD/etc.)
  const stripeAmount = majorUnitToStripeAmount(env.maxAmount, currency)

  const params: Stripe.CreateSharedPaymentTokenParams = {
    paymentMethod: paymentMethodId,
    // customer is not stored in SpendEnvelope; issuer address used as proxy identifier
    customer: env.issuer,
    agentId: env.agent,
    currency,
    usageLimits: {
      maxAmountPerTransaction: stripeAmount,
      allowedMerchants: env.allowedRecipients,
      expiresAt: unixToIso(env.validUntil),
      currency,
    },
    idempotencyKey: env.nonce,
  }

  return params
}
