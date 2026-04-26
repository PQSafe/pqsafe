/**
 * Sprint 2 — Spend Policy type definitions and validation.
 *
 * IMPLEMENTATION STATUS: Types + validation only. No enforcement.
 * Enforcement (check-and-reserve CAS against the hosted issuer service) is
 * Sprint 2 production work — queued for May 5–18.
 *
 * Three policy modes (see design doc §1 for full architecture):
 *
 *   single_use     — envelope authorizes exactly ONE payment; nonce is
 *                    consumed on first successful settlement.  Default and
 *                    backward-compatible with all Sprint 1 envelopes.
 *
 *   per_tx_cap     — envelope can be reused for multiple payments, each
 *                    individually capped at `perTxLimit`.  Useful for
 *                    recurring micro-payments (e.g. x402 per-call billing).
 *
 *   cumulative_cap — envelope tracks a running spend balance; payments are
 *                    allowed until `maxAmount` is exhausted.  Requires the
 *                    hosted issuer service to maintain the authoritative
 *                    debit ledger (not local / client-side).
 *
 * Wire format: `spendPolicy` is an optional field on SpendEnvelope v1.
 * Absence ≡ `{ mode: 'single_use' }` for full backward compatibility.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Policy mode union
// ---------------------------------------------------------------------------

export const SpendPolicyModeSchema = z.enum([
  'single_use',
  'per_tx_cap',
  'cumulative_cap',
])
export type SpendPolicyMode = z.infer<typeof SpendPolicyModeSchema>

// ---------------------------------------------------------------------------
// Per-mode policy objects
// ---------------------------------------------------------------------------

/**
 * single_use: one payment, then the nonce is burned.
 * No extra fields required.
 */
export const SingleUsePolicySchema = z.object({
  mode: z.literal('single_use'),
})
export type SingleUsePolicy = z.infer<typeof SingleUsePolicySchema>

/**
 * per_tx_cap: each individual payment must be <= perTxLimit.
 * The envelope may be presented multiple times until it expires or is revoked.
 * Requires the hosted issuer service to track nonce state.
 */
export const PerTxCapPolicySchema = z.object({
  mode: z.literal('per_tx_cap'),
  /**
   * Maximum amount per individual payment (same currency as envelope.currency).
   * Must be <= envelope.maxAmount.
   */
  perTxLimit: z.number().positive(),
})
export type PerTxCapPolicy = z.infer<typeof PerTxCapPolicySchema>

/**
 * cumulative_cap: payments are allowed until the running total reaches
 * envelope.maxAmount. The hosted issuer service maintains the debit ledger.
 * Settlement webhooks update the running balance atomically.
 */
export const CumulativeCapPolicySchema = z.object({
  mode: z.literal('cumulative_cap'),
  /**
   * Optional: reset window in seconds. If set, the cumulative counter resets
   * every `resetWindowSeconds`. Enables weekly/monthly budget envelopes.
   * If omitted, the cap is lifetime (no reset).
   */
  resetWindowSeconds: z.number().int().positive().optional(),
})
export type CumulativeCapPolicy = z.infer<typeof CumulativeCapPolicySchema>

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export const SpendPolicySchema = z.discriminatedUnion('mode', [
  SingleUsePolicySchema,
  PerTxCapPolicySchema,
  CumulativeCapPolicySchema,
])
export type SpendPolicy = z.infer<typeof SpendPolicySchema>

// ---------------------------------------------------------------------------
// Default policy (backward compat)
// ---------------------------------------------------------------------------

/** The default policy applied when spendPolicy is omitted from the envelope. */
export const DEFAULT_SPEND_POLICY: SingleUsePolicy = { mode: 'single_use' }

// ---------------------------------------------------------------------------
// Wire format patch for SpendEnvelope
// ---------------------------------------------------------------------------

/**
 * The additional fields that Sprint 2 adds to SpendEnvelope.
 * These are OPTIONAL so Sprint 1 envelopes remain valid (no migration needed).
 *
 * Usage (Sprint 2 production):
 *   const SpendEnvelopeV2Schema = SpendEnvelopeSchema.merge(SpendEnvelopeExtV2Schema)
 *
 * Until Sprint 2 production lands, these fields are accepted but not enforced.
 */
export const SpendEnvelopeExtV2Schema = z.object({
  /**
   * Spend policy for this envelope. Defaults to single_use if omitted.
   * Absent on all Sprint 1 envelopes — treated as { mode: 'single_use' }.
   */
  spendPolicy: SpendPolicySchema.optional(),

  /**
   * Caller-supplied idempotency key (separate from the nonce).
   * Used by the hosted issuer service to deduplicate retry storms.
   * Format: UUID v4 or opaque string ≤128 chars.
   */
  clientRequestId: z.string().min(1).max(128).optional(),
})
export type SpendEnvelopeExtV2 = z.infer<typeof SpendEnvelopeExtV2Schema>

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate a SpendPolicy object. Throws if the policy is structurally invalid.
 * Used by the hosted issuer API to validate caller-supplied policies.
 */
export function validateSpendPolicy(raw: unknown): SpendPolicy {
  return SpendPolicySchema.parse(raw)
}

/**
 * Return the effective spend policy for an envelope, defaulting to single_use.
 * Safe to call on Sprint 1 envelopes that have no spendPolicy field.
 */
export function effectivePolicy(envelopeFields: { spendPolicy?: SpendPolicy }): SpendPolicy {
  return envelopeFields.spendPolicy ?? DEFAULT_SPEND_POLICY
}

/**
 * Cross-field validation: verify that perTxLimit does not exceed maxAmount.
 * Call this after parsing both envelope + policy.
 *
 * @throws if the policy is logically inconsistent with the envelope's maxAmount.
 */
export function assertPolicyConsistency(
  policy: SpendPolicy,
  maxAmount: number,
): void {
  if (policy.mode === 'per_tx_cap') {
    if (policy.perTxLimit > maxAmount) {
      throw new Error(
        `SpendPolicy.perTxLimit (${policy.perTxLimit}) must be <= ` +
        `envelope.maxAmount (${maxAmount})`,
      )
    }
  }
}
