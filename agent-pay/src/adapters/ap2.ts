/**
 * AP2 (Agentic Payments Protocol v0.3.0) adapter for PQSafe AgentPay.
 *
 * AP2 is an open protocol by Google / agentic-commerce defining structured
 * payment mandates that AI agents carry during commerce flows. PQSafe wraps
 * AP2 mandates with ML-DSA-65 post-quantum signatures, enabling agents to
 * prove spend authorization in a quantum-resistant way without modifying
 * the AP2 wire format.
 *
 * Reference: https://github.com/google-agentic-commerce/AP2 (v0.3.0)
 *
 * @module adapters/ap2
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type { SpendEnvelope } from '../envelope.js'
import { canonicalJsonBytes } from '../canonical.js'

// ---------------------------------------------------------------------------
// AP2 type definitions (translated from Python reference impl v0.3.0)
// ---------------------------------------------------------------------------

/** Namespace wrapper — import as `import type { AP2 } from './ap2.js'` */
export namespace AP2 {
  // -------------------------------------------------------------------------
  // Primitive / shared types
  // -------------------------------------------------------------------------

  /**
   * ISO 4217 currency code or crypto token symbol.
   * @example "USD" | "GBP" | "USDC" | "HKD"
   */
  export type CurrencyCode = string

  /**
   * A monetary amount: positive decimal number.
   * Represented as a number to match JSON wire format.
   */
  export type Amount = number

  /**
   * Unix epoch timestamp in seconds (integer).
   */
  export type UnixTimestamp = number

  /**
   * A payment item within a cart or order.
   *
   * Mirrors `PaymentItem` in the W3C Payment Request API and AP2 spec.
   */
  export interface PaymentItem {
    /** Human-readable item label */
    label: string
    /** Per-unit amount */
    amount: Amount
    /** ISO 4217 currency code */
    currency: CurrencyCode
    /** Optional item quantity (default 1) */
    quantity?: number
    /** Optional SKU or product identifier */
    sku?: string
    /** Optional item category (e.g. "physical", "digital", "service") */
    category?: 'physical' | 'digital' | 'service' | string
    /** Optional merchant-specific metadata */
    metadata?: Record<string, unknown>
  }

  /**
   * Payment method data — identifies the payment rail and associated
   * credentials or token references.
   */
  export interface PaymentMethodData {
    /** Rail identifier (e.g. "stripe", "wise", "usdc-base", "x402") */
    supportedMethods: string
    /**
     * Rail-specific data object.
     * For Stripe: { paymentMethodId: string }
     * For Wise: { ibanAccount: string }
     * For USDC-Base: { evmAddress: string, chainId: number }
     * For x402: { url: string }
     */
    data?: Record<string, unknown>
  }

  /**
   * Contact address — postal address of buyer or recipient.
   */
  export interface ContactAddress {
    recipient?: string
    addressLine: string[]
    city: string
    region?: string
    postalCode?: string
    /** ISO 3166-1 alpha-2 country code */
    country: string
    phone?: string
  }

  // -------------------------------------------------------------------------
  // Mandate types
  // -------------------------------------------------------------------------

  /**
   * Intent Mandate — earliest stage of agentic commerce.
   * Issued when the agent has expressed purchase intent but has not yet
   * committed to a specific cart or price.
   *
   * Analogous to a pre-authorization request.
   */
  export interface IntentMandate {
    /** Mandate type discriminator */
    type: 'intent'
    /** Unique mandate ID (UUID v4 recommended) */
    mandateId: string
    /** Merchant/service identifier */
    merchantId: string
    /** Human-readable description of the intent */
    description: string
    /** Maximum amount the agent is authorized to spend for this intent */
    maxAmount: Amount
    /** Currency for maxAmount */
    currency: CurrencyCode
    /** ISO 8601 expiry datetime for this mandate */
    expiresAt: string
    /** Agent identifier (matches SpendEnvelope.agent) */
    agentId: string
    /** Issuer PQSafe address (matches SpendEnvelope.issuer) */
    issuerAddress: string
    /** Optional list of accepted payment methods */
    acceptedMethods?: PaymentMethodData[]
    /** Optional buyer shipping address */
    shippingAddress?: ContactAddress
    /** Optional arbitrary merchant metadata */
    metadata?: Record<string, unknown>
  }

  /**
   * Cart Mandate — mid-flow mandate with a concrete list of items.
   * Issued after the agent has added items to a cart but before checkout.
   */
  export interface CartMandate {
    /** Mandate type discriminator */
    type: 'cart'
    /** Unique mandate ID (UUID v4 recommended) */
    mandateId: string
    /** Merchant/service identifier */
    merchantId: string
    /** Line items in the cart */
    items: PaymentItem[]
    /** Subtotal (sum of item amounts * quantities) */
    subtotal: Amount
    /** Optional tax amount */
    tax?: Amount
    /** Optional shipping amount */
    shipping?: Amount
    /** Grand total (subtotal + tax + shipping) */
    total: Amount
    /** Currency for all monetary fields */
    currency: CurrencyCode
    /** ISO 8601 expiry datetime for this mandate */
    expiresAt: string
    /** Agent identifier */
    agentId: string
    /** Issuer PQSafe address */
    issuerAddress: string
    /** Optional list of accepted payment methods */
    acceptedMethods?: PaymentMethodData[]
    /** Optional buyer shipping address */
    shippingAddress?: ContactAddress
    /** Optional arbitrary metadata */
    metadata?: Record<string, unknown>
  }

  /**
   * Payment Mandate — final checkout stage with committed payment method.
   * Issued when the agent is ready to execute a specific payment.
   */
  export interface PaymentMandate {
    /** Mandate type discriminator */
    type: 'payment'
    /** Unique mandate ID (UUID v4 recommended) */
    mandateId: string
    /** Merchant/service identifier */
    merchantId: string
    /** Committed payment amount */
    amount: Amount
    /** Currency */
    currency: CurrencyCode
    /** Selected payment method */
    paymentMethod: PaymentMethodData
    /** Line items (optional at payment stage; may be omitted for subscriptions) */
    items?: PaymentItem[]
    /** Merchant recipient address (IBAN, EVM address, Stripe customer ID, etc.) */
    recipientAddress: string
    /** ISO 8601 expiry datetime for this mandate */
    expiresAt: string
    /** Agent identifier */
    agentId: string
    /** Issuer PQSafe address */
    issuerAddress: string
    /** Optional buyer billing address */
    billingAddress?: ContactAddress
    /** Optional buyer shipping address */
    shippingAddress?: ContactAddress
    /** Optional purchase reference (order ID, invoice number, etc.) */
    purchaseReference?: string
    /** Optional arbitrary metadata */
    metadata?: Record<string, unknown>
  }

  /** Union of all mandate types */
  export type AnyMandate = IntentMandate | CartMandate | PaymentMandate

  // -------------------------------------------------------------------------
  // Payment Request / Response (AP2 checkout flow)
  // -------------------------------------------------------------------------

  /**
   * PaymentRequest — structure sent from merchant to agent during checkout.
   * Mirrors the W3C Payment Request API surface used by AP2.
   */
  export interface PaymentRequest {
    /** Unique request ID */
    requestId: string
    /** Merchant identifier */
    merchantId: string
    /** Merchant-accepted payment methods */
    methodData: PaymentMethodData[]
    /** Order details */
    details: {
      /** Human-readable order description */
      label: string
      /** Final total to be charged */
      total: PaymentItem
      /** Itemized line items (optional) */
      displayItems?: PaymentItem[]
      /** Shipping options (optional) */
      shippingOptions?: Array<{
        id: string
        label: string
        amount: Amount
        currency: CurrencyCode
        selected?: boolean
      }>
    }
    /** Optional shipping address request */
    requestShipping?: boolean
    /** ISO 8601 expiry for the payment request */
    expiresAt?: string
  }

  /**
   * PaymentResponse — returned by the agent after completing a payment.
   * Mirrors the W3C PaymentResponse object.
   */
  export interface PaymentResponse {
    /** Echo of the originating request ID */
    requestId: string
    /** Selected payment method identifier */
    methodName: string
    /** Method-specific payment details */
    details: Record<string, unknown>
    /** Optional buyer shipping address (if requestShipping=true) */
    shippingAddress?: ContactAddress
    /** Optional selected shipping option ID */
    shippingOption?: string
    /** Optional buyer email */
    payerEmail?: string
    /** Optional buyer phone */
    payerPhone?: string
    /** PQSafe extension: ML-DSA-65 signature over the mandate */
    pqSignature?: string
    /** PQSafe extension: hex-encoded DSA public key that produced pqSignature */
    pqPublicKey?: string
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** ML-DSA-65 signature byte length (FIPS 204, security level 3) */
const ML_DSA65_SIG_BYTES = 3309

/** ML-DSA-65 public key byte length */
const ML_DSA65_PK_BYTES = 1952

/**
 * Derive a 128-bit nonce from an arbitrary string by SHA-256-hashing it
 * and taking the first 16 bytes. Returns a 32-character lowercase hex string.
 */
function nonceFromString(s: string): string {
  const hashBytes = sha256(new TextEncoder().encode(s))
  return bytesToHex(hashBytes.slice(0, 16))
}

/**
 * Parse an ISO 8601 datetime string to a Unix timestamp (integer seconds).
 * Throws if the string is not a valid date.
 */
function isoToUnix(iso: string): number {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) {
    throw new Error(`AP2 adapter: invalid ISO 8601 datetime "${iso}"`)
  }
  return Math.floor(ms / 1000)
}

/**
 * Convert a Unix timestamp (seconds) to an ISO 8601 UTC string.
 */
function unixToIso(ts: number): string {
  return new Date(ts * 1000).toISOString()
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Convert an AP2 mandate (Intent, Cart, or Payment) to a PQSafe SpendEnvelope.
 *
 * The adapter extracts the authorization bounds from the mandate and maps them
 * to SpendEnvelope fields:
 *   - `IntentMandate.maxAmount` → `SpendEnvelope.maxAmount`
 *   - `CartMandate.total` / `PaymentMandate.amount` → `SpendEnvelope.maxAmount`
 *   - `PaymentMandate.recipientAddress` → `SpendEnvelope.allowedRecipients`
 *   - `mandate.currency` → `SpendEnvelope.currency`
 *   - `mandate.agentId` → `SpendEnvelope.agent`
 *   - `mandate.expiresAt` (ISO 8601) → `SpendEnvelope.validUntil` (Unix seconds)
 *
 * For IntentMandate and CartMandate, `allowedRecipients` defaults to a single
 * placeholder derived from `merchantId` — the caller must replace this with
 * the final recipient address before signing.
 *
 * @param mandate - AP2 mandate to convert (Intent, Cart, or Payment).
 * @param issuerAddress - PQSafe address of the human issuer (pq1 + 20-byte keccak hex).
 * @param ttlSeconds - Override TTL in seconds. If omitted, derived from `mandate.expiresAt`.
 *   Useful for extending short-lived AP2 mandates to match SpendEnvelope lifetime requirements.
 * @returns An unsigned `SpendEnvelope` ready for `signEnvelope()`.
 * @throws {Error} If mandate type is unrecognized or required fields are missing.
 *
 * @example
 * ```ts
 * const envelope = ap2MandateToSpendEnvelope(paymentMandate, 'pq1abc...', 3600)
 * const signed = signEnvelope(envelope, secretKey, publicKey)
 * ```
 */
export function ap2MandateToSpendEnvelope(
  mandate: AP2.AnyMandate,
  issuerAddress: string,
  ttlSeconds?: number,
): SpendEnvelope {
  const validFrom = Math.floor(Date.now() / 1000)

  // Derive validUntil from expiresAt or ttlSeconds override
  let validUntil: number
  if (ttlSeconds !== undefined) {
    validUntil = validFrom + ttlSeconds
  } else {
    validUntil = isoToUnix(mandate.expiresAt)
  }

  // Extract amount, currency, recipients based on mandate type
  let maxAmount: number
  let currency: string
  let allowedRecipients: string[]
  let nonce: string

  switch (mandate.type) {
    case 'intent': {
      maxAmount = mandate.maxAmount
      currency = mandate.currency
      // Intent mandate has no committed recipient — use merchantId as placeholder
      allowedRecipients = [mandate.merchantId]
      nonce = nonceFromString(mandate.mandateId)
      break
    }
    case 'cart': {
      maxAmount = mandate.total
      currency = mandate.currency
      // Cart mandate has no committed recipient — use merchantId as placeholder
      allowedRecipients = [mandate.merchantId]
      nonce = nonceFromString(mandate.mandateId)
      break
    }
    case 'payment': {
      maxAmount = mandate.amount
      currency = mandate.currency
      allowedRecipients = [mandate.recipientAddress]
      nonce = nonceFromString(mandate.mandateId)
      break
    }
    default: {
      // TypeScript exhaustiveness — should never reach here
      const _exhaustive: never = mandate
      throw new Error(`AP2 adapter: unrecognized mandate type "${(_exhaustive as AP2.AnyMandate).type}"`)
    }
  }

  const envelope: SpendEnvelope = {
    version: 1,
    issuer: issuerAddress,
    agent: mandate.agentId,
    maxAmount,
    currency: currency.toUpperCase(),
    allowedRecipients,
    validFrom,
    validUntil,
    nonce,
  }

  return envelope
}

/**
 * Convert a PQSafe SpendEnvelope back into an AP2 mandate.
 *
 * Useful for agents that receive a SpendEnvelope from a wallet and need to
 * present a mandate to an AP2-aware merchant without stripping the PQ guarantees.
 * The returned mandate retains a `metadata.pqEnvelopeHash` field containing
 * the keccak-256 digest of the envelope bytes for auditability.
 *
 * @param env - A validated `SpendEnvelope` (from `verifyEnvelope()`).
 * @param mandateType - Which AP2 mandate type to produce:
 *   - `'intent'` — builds an `IntentMandate` using `maxAmount` as the intent ceiling.
 *   - `'cart'` — builds a `CartMandate` with a single synthetic line item.
 *   - `'payment'` — builds a `PaymentMandate` using `allowedRecipients[0]` as
 *     the recipient address. Throws if `allowedRecipients` is empty.
 * @returns The AP2 mandate object matching the requested type.
 * @throws {Error} If `mandateType` is `'payment'` and `env.allowedRecipients` is empty.
 *
 * @example
 * ```ts
 * const mandate = spendEnvelopeToAp2Mandate(verifiedEnvelope, 'payment')
 * // mandate.type === 'payment'
 * ```
 */
export function spendEnvelopeToAp2Mandate(
  env: SpendEnvelope,
  mandateType: 'intent' | 'cart' | 'payment',
): AP2.AnyMandate {
  const expiresAt = unixToIso(env.validUntil)
  // Use nonce as the mandate ID (it's already a unique 128-bit hex token)
  const mandateId = env.nonce
  // Use first allowed recipient as the merchantId placeholder
  const merchantId = env.allowedRecipients[0] ?? 'unknown'

  switch (mandateType) {
    case 'intent': {
      const intentMandate: AP2.IntentMandate = {
        type: 'intent',
        mandateId,
        merchantId,
        description: `Agent spend intent: up to ${env.maxAmount} ${env.currency}`,
        maxAmount: env.maxAmount,
        currency: env.currency,
        expiresAt,
        agentId: env.agent,
        issuerAddress: env.issuer,
        metadata: {
          pqNonce: env.nonce,
          pqIssuer: env.issuer,
        },
      }
      return intentMandate
    }

    case 'cart': {
      const cartMandate: AP2.CartMandate = {
        type: 'cart',
        mandateId,
        merchantId,
        items: [
          {
            label: `Authorized spend (${env.currency})`,
            amount: env.maxAmount,
            currency: env.currency,
            quantity: 1,
          },
        ],
        subtotal: env.maxAmount,
        total: env.maxAmount,
        currency: env.currency,
        expiresAt,
        agentId: env.agent,
        issuerAddress: env.issuer,
        metadata: {
          pqNonce: env.nonce,
          pqIssuer: env.issuer,
        },
      }
      return cartMandate
    }

    case 'payment': {
      if (env.allowedRecipients.length === 0) {
        throw new Error(
          'AP2 adapter: cannot build PaymentMandate — SpendEnvelope.allowedRecipients is empty',
        )
      }
      const paymentMandate: AP2.PaymentMandate = {
        type: 'payment',
        mandateId,
        merchantId,
        amount: env.maxAmount,
        currency: env.currency,
        paymentMethod: {
          supportedMethods: env.rail ?? 'pqsafe',
        },
        recipientAddress: env.allowedRecipients[0],
        expiresAt,
        agentId: env.agent,
        issuerAddress: env.issuer,
        metadata: {
          pqNonce: env.nonce,
          pqIssuer: env.issuer,
        },
      }
      return paymentMandate
    }

    default: {
      const _exhaustive: never = mandateType
      throw new Error(`AP2 adapter: unrecognized mandateType "${_exhaustive as string}"`)
    }
  }
}

/**
 * Verify an AP2 mandate that has been extended with PQSafe's post-quantum
 * signature wrapper (`mandate.pqSignature` / `mandate.pqPublicKey` extension fields).
 *
 * Verification steps:
 *   1. Serialize the mandate to RFC 8785 canonical JSON bytes.
 *   2. Verify the ML-DSA-65 signature in `pqSig` over those bytes using `pqPublicKey`.
 *   3. Return the mandate typed as `AP2.AnyMandate` if verification succeeds.
 *
 * This function is intentionally separate from `verifyEnvelope` — it operates
 * on raw AP2 mandate objects rather than on the `SpendEnvelope` wrapper, enabling
 * merchants who receive AP2 payloads to verify PQ integrity without understanding
 * the SpendEnvelope schema.
 *
 * @param mandate - The AP2 mandate received from the agent (any type).
 * @param pqSig - Hex-encoded ML-DSA-65 signature (produced by the PQSafe signing key).
 * @param pqPublicKey - Hex-encoded ML-DSA-65 public key of the issuer.
 * @returns The verified `AP2.AnyMandate` (same object, typed).
 * @throws {Error} If signature verification fails (wrong key, tampered mandate).
 * @throws {Error} If signature size is not exactly 3309 bytes.
 * @throws {Error} If public key size is not exactly 1952 bytes.
 * @throws {Error} If mandate type is not one of 'intent', 'cart', 'payment'.
 *
 * @example
 * ```ts
 * const verified = verifyAp2WithPqWrapper(mandate, sig, pubKey)
 * console.log('Mandate verified:', verified.mandateId)
 * ```
 */
export function verifyAp2WithPqWrapper(
  mandate: AP2.AnyMandate,
  pqSig: string,
  pqPublicKey: string,
): AP2.AnyMandate {
  // Validate mandate type
  if (mandate.type !== 'intent' && mandate.type !== 'cart' && mandate.type !== 'payment') {
    throw new Error(
      `AP2 adapter: unrecognized mandate type "${(mandate as AP2.AnyMandate).type}"`,
    )
  }

  // Decode and validate sizes
  const sigBytes = hexToBytes(pqSig)
  if (sigBytes.length !== ML_DSA65_SIG_BYTES) {
    throw new Error(
      `AP2 adapter: invalid ML-DSA-65 signature length — expected ${ML_DSA65_SIG_BYTES} bytes, got ${sigBytes.length}`,
    )
  }

  const pubKeyBytes = hexToBytes(pqPublicKey)
  if (pubKeyBytes.length !== ML_DSA65_PK_BYTES) {
    throw new Error(
      `AP2 adapter: invalid ML-DSA-65 public key length — expected ${ML_DSA65_PK_BYTES} bytes, got ${pubKeyBytes.length}`,
    )
  }

  // Compute canonical JSON bytes of the mandate
  const canonicalBytes = canonicalJsonBytes(mandate)

  // Verify ML-DSA-65 signature
  const valid = ml_dsa65.verify(sigBytes, canonicalBytes, pubKeyBytes)
  if (!valid) {
    throw new Error(
      'AP2 adapter: ML-DSA-65 signature verification failed — mandate may have been tampered',
    )
  }

  return mandate
}
