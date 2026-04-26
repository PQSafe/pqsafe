/**
 * Sprint 2 — TTL policy by amount tier.
 *
 * Returns recommended validFrom / validUntil offsets (in seconds from "now")
 * and the revocation layer coverage appropriate for the payment amount.
 *
 * Tiers (all amounts treated as USD equivalent):
 *   < $5        → 5 minutes   (Layer 1 only)
 *   $5–$100     → 30 minutes  (Layer 1 + Layer 2)
 *   $100–$1000  → 24 hours    (all 3 layers)
 *   $1000–$10000 → 4 hours    (all 3 layers + multi-sig recommended)
 *   > $10000    → 1 hour      (all 3 layers + 2-of-3 multi-sig required)
 */

export interface TTLPolicy {
  /** Offset in seconds from "now" before the envelope becomes active. Always 0. */
  validFromOffset: number
  /** Offset in seconds from "now" until the envelope expires. */
  validUntilOffset: number
  /** Revocation layer coverage: L1=TTL only, L2=+epoch, L3=+per-envelope registry. */
  layer: 'L1' | 'L2' | 'L3'
  /** Whether 2-of-3 multi-sig is recommended (non-binding advisory). */
  multiSigRecommended?: boolean
  /** Whether 2-of-3 multi-sig is required (enforced by policy). */
  multiSigRequired?: boolean
}

/** Micro-payment threshold: under this, Layer 1 only and failOpen applies. */
export const MICRO_PAYMENT_THRESHOLD_USD = 5

/** Amount boundaries in USD (as floating-point for human readability). */
const TIER_100 = 100
const TIER_1000 = 1000
const TIER_10000 = 10000

/** TTL values in seconds. */
const TTL_5MIN = 5 * 60
const TTL_30MIN = 30 * 60
const TTL_1HR = 60 * 60
const TTL_4HR = 4 * 60 * 60
const TTL_24HR = 24 * 60 * 60

/**
 * Return the recommended TTL policy for a payment of the given amount.
 *
 * @param amount    Payment amount in the specified currency (bigint in minor units
 *                  if currency has decimals, or regular number via overload)
 * @param currency  ISO 4217 currency code (e.g. 'USD', 'HKD', 'USDC').
 *                  Only USD / USDC are directly used for tier comparison.
 *                  All other currencies are treated at face value (i.e. the
 *                  `amount` is assumed to be already in USD-equivalent units).
 *
 * Note: `amount` is expressed as a plain number representing the dollar (or
 * equivalent) value.  Use `Number(amount)` when calling with a bigint.
 */
export function recommendedTTL(
  amount: bigint,
  currency: string,
): TTLPolicy {
  // Normalise: bigint → number for comparison.
  // For USDC the amount is typically in 6-decimal atomic units; callers are
  // responsible for converting to USD-equivalent before calling this function.
  const amountNum = Number(amount)

  void currency // Future: apply FX conversion; currently all treated as USD.

  if (amountNum < MICRO_PAYMENT_THRESHOLD_USD) {
    return {
      validFromOffset: 0,
      validUntilOffset: TTL_5MIN,
      layer: 'L1',
    }
  }

  if (amountNum < TIER_100) {
    return {
      validFromOffset: 0,
      validUntilOffset: TTL_30MIN,
      layer: 'L2',
    }
  }

  if (amountNum < TIER_1000) {
    return {
      validFromOffset: 0,
      validUntilOffset: TTL_24HR,
      layer: 'L3',
    }
  }

  if (amountNum <= TIER_10000) {
    return {
      validFromOffset: 0,
      validUntilOffset: TTL_4HR,
      layer: 'L3',
      multiSigRecommended: true,
    }
  }

  // amount > $10,000
  return {
    validFromOffset: 0,
    validUntilOffset: TTL_1HR,
    layer: 'L3',
    multiSigRecommended: true,
    multiSigRequired: true,
  }
}
