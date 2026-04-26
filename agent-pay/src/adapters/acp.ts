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
 * Production implementation queued for Sprint 2 (May 19 → Jun 8, 2026).
 *
 * @module adapters/acp
 */

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
// Stub functions (production implementation: Sprint 2)
// ---------------------------------------------------------------------------

/**
 * Convert a Stripe Shared Payment Token to a PQSafe SpendEnvelope.
 *
 * The adapter maps SPT authorization limits to SpendEnvelope policy fields:
 *   - `token.usageLimits.maxAmountPerTransaction` → `SpendEnvelope.maxAmount`
 *     (falls back to `maxTotalAmount` if per-transaction limit is absent)
 *   - `token.currency` → `SpendEnvelope.currency`
 *   - `token.agentId` → `SpendEnvelope.agent`
 *   - `token.usageLimits.allowedMerchants` → `SpendEnvelope.allowedRecipients`
 *     (Stripe merchant IDs used as recipient identifiers on the Stripe rail)
 *   - `token.usageLimits.expiresAt` (ISO 8601) → `SpendEnvelope.validUntil`
 *
 * The resulting SpendEnvelope constrains the PQ-signed authorization to the
 * same bounds as the SPT, creating a cryptographic dual of the Stripe token
 * that can be verified offline without a Stripe API call.
 *
 * @param token - A `Stripe.SharedPaymentToken` retrieved from the Stripe API.
 * @param issuerAddress - PQSafe address of the human issuer (pq1 + 20-byte keccak hex).
 *   Must match the Stripe customer who created the SPT.
 * @param agentId - Override for the agent identifier. If omitted, uses `token.agentId`.
 *   Useful when an SPT is reused across multiple named agent sessions.
 * @returns An unsigned `SpendEnvelope` ready for `signEnvelope()`.
 * @throws {'Stripe ACP adapter — production implementation queued for Sprint 2.'} Always — stub.
 * @throws {Error} If `token.active` is false (cannot create envelope for inactive token).
 * @throws {Error} If `usageLimits.allowedMerchants` is absent (allowlist required by PQSafe policy).
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
  void token
  void issuerAddress
  void agentId
  throw new Error('Stripe ACP adapter — production implementation queued for Sprint 2.')
}

/**
 * Convert a PQSafe SpendEnvelope back into Stripe SPT creation parameters.
 *
 * Enables a workflow where an agent holds a SpendEnvelope (issued by a
 * PQSafe wallet) and needs to obtain a Stripe SPT to actually charge a
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
 * @param env - A validated `SpendEnvelope` (from `verifyEnvelope()`).
 * @param paymentMethodId - Stripe payment method ID (pm_*) to attach to the SPT.
 * @returns `Stripe.CreateSharedPaymentTokenParams` ready to post to Stripe API.
 * @throws {'Stripe ACP adapter — production implementation queued for Sprint 2.'} Always — stub.
 * @throws {Error} If `env.rail` is set and is not `'stripe'` (wrong rail for SPT creation).
 * @throws {Error} If `env.allowedRecipients` is empty (SPT requires at least one allowed merchant).
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
  void env
  void paymentMethodId
  throw new Error('Stripe ACP adapter — production implementation queued for Sprint 2.')
}
