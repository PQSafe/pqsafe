/**
 * SpendEnvelope — PQ-signed authorization token issued by a wallet owner to an AI agent.
 *
 * The envelope specifies:
 *   - which agent is authorized
 *   - maximum spend amount and currency
 *   - allowed recipient list (allowlist; empty = all blocked)
 *   - validity window (validFrom / validUntil, Unix timestamps)
 *   - optional rail constraint
 *   - a nonce to prevent replay
 *
 * Signing: ML-DSA-65 over the deterministic JSON bytes of the envelope.
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { z } from 'zod'
import type { Rail, HexString, SignedEnvelope } from './types.js'

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const RailSchema = z.enum([
  'airwallex',
  'wise',
  'stripe',
  'usdc-base',
  'x402',
])

export const SpendEnvelopeSchema = z.object({
  /** Schema version — must be 1 */
  version: z.literal(1),

  /** PQSafe address of the human issuer (pq1 + 20-byte keccak hex) */
  issuer: z.string().regex(/^pq1[0-9a-f]{40}$/, 'Invalid PQSafe address'),

  /** Agent identifier — free-form string (e.g. "raymond-ai-coo-v1", "content-officer") */
  agent: z.string().min(1).max(128),

  /** Maximum total amount the agent may spend (in the given currency) */
  maxAmount: z.number().positive(),

  /** ISO 4217 currency code */
  currency: z.string().length(3),

  /**
   * Allowlist of recipients. Agent may ONLY pay to addresses in this list.
   * Rail-specific format (IBAN, crypto address, Stripe customer ID, etc.).
   * Empty array = no recipients allowed (envelope is effectively frozen).
   */
  allowedRecipients: z.array(z.string()).min(1),

  /** Unix timestamp (seconds) — envelope not valid before this time */
  validFrom: z.number().int().positive(),

  /** Unix timestamp (seconds) — envelope expires after this time */
  validUntil: z.number().int().positive(),

  /** Random hex nonce (128-bit) to prevent replay attacks */
  nonce: z.string().regex(/^[0-9a-f]{32}$/, 'Nonce must be 32 hex chars (128-bit)'),

  /** Optional: constrain to a single payment rail. Omit to allow router to choose. */
  rail: RailSchema.optional(),
})

export type SpendEnvelope = z.infer<typeof SpendEnvelopeSchema>

// ---------------------------------------------------------------------------
// Envelope helpers
// ---------------------------------------------------------------------------

export interface CreateEnvelopeParams {
  issuer: string
  agent: string
  maxAmount: number
  currency: string
  allowedRecipients: string[]
  /** Seconds from now before envelope activates (default: 0 = immediately) */
  startsInSeconds?: number
  /** Seconds the envelope is valid for (default: 3600 = 1 hour) */
  ttlSeconds?: number
  rail?: Rail
}

/**
 * Build a new (unsigned) SpendEnvelope.
 * Nonce is generated with crypto.getRandomValues for collision resistance.
 */
export function createEnvelope(params: CreateEnvelopeParams): SpendEnvelope {
  const now = Math.floor(Date.now() / 1000)
  const nonce = bytesToHex(
    globalThis.crypto.getRandomValues(new Uint8Array(16)),
  )

  const raw: SpendEnvelope = {
    version: 1,
    issuer: params.issuer,
    agent: params.agent,
    maxAmount: params.maxAmount,
    currency: params.currency.toUpperCase(),
    allowedRecipients: params.allowedRecipients,
    validFrom: now + (params.startsInSeconds ?? 0),
    validUntil: now + (params.ttlSeconds ?? 3600),
    nonce,
    ...(params.rail ? { rail: params.rail } : {}),
  }

  // Validate before returning
  return SpendEnvelopeSchema.parse(raw)
}

/**
 * Deterministically serialize an envelope to bytes for signing.
 * Keys are sorted for reproducibility across platforms.
 */
function sortedJsonReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    )
  }
  return value
}

function envelopeToBytes(envelope: SpendEnvelope): Uint8Array {
  const sorted = JSON.stringify(envelope, sortedJsonReplacer)
  return new TextEncoder().encode(sorted)
}

/**
 * Sign a SpendEnvelope with the issuer's ML-DSA-65 secret key.
 * Returns a SignedEnvelope ready for agent use.
 */
export function signEnvelope(
  envelope: SpendEnvelope,
  dsaSecretKey: Uint8Array,
  dsaPublicKey: Uint8Array,
): SignedEnvelope {
  const validated = SpendEnvelopeSchema.parse(envelope)
  const msgBytes = envelopeToBytes(validated)
  const sig = ml_dsa65.sign(msgBytes, dsaSecretKey)

  return {
    envelopeJson: new TextDecoder().decode(msgBytes),
    signature: bytesToHex(sig),
    dsaPublicKey: bytesToHex(dsaPublicKey),
  }
}

/**
 * Verify a SignedEnvelope and return the parsed SpendEnvelope if valid.
 * Throws if signature is invalid, envelope is malformed, or expired.
 */
export function verifyEnvelope(
  signed: SignedEnvelope,
  dsaPublicKey?: Uint8Array,
): SpendEnvelope {
  // Resolve key: prefer explicit arg, fall back to embedded key
  const pubKeyBytes = dsaPublicKey ?? hexToBytes(signed.dsaPublicKey)
  const sigBytes = hexToBytes(signed.signature)
  const msgBytes = new TextEncoder().encode(signed.envelopeJson)

  const valid = ml_dsa65.verify(sigBytes, msgBytes, pubKeyBytes)
  if (!valid) throw new Error('PQSafe: envelope signature verification failed')

  // Parse and validate schema
  let envelope: SpendEnvelope
  try {
    envelope = SpendEnvelopeSchema.parse(JSON.parse(signed.envelopeJson))
  } catch (err) {
    throw new Error(`PQSafe: envelope schema invalid — ${String(err)}`)
  }

  // Check temporal validity
  const now = Math.floor(Date.now() / 1000)
  if (now < envelope.validFrom) {
    throw new Error(`PQSafe: envelope not yet active (validFrom=${envelope.validFrom})`)
  }
  if (now > envelope.validUntil) {
    throw new Error(`PQSafe: envelope expired (validUntil=${envelope.validUntil})`)
  }

  return envelope
}
