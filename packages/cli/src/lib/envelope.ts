/**
 * envelope.ts — build, sign, and fingerprint SpendEnvelopes
 *
 * Protocol (matches agent-pay SDK + Worker verifier exactly):
 *   canonicalJson = JCS( spendEnvelope )
 *   signature     = ML-DSA-65.sign( canonicalJsonBytes, secretKey )
 *   wire format   = { envelopeJson, signature, dsaPublicKey }
 *
 * Note: signs the raw JCS bytes — NOT SHA-256(JCS). This is the live
 * Worker protocol as implemented in agent-pay/src/envelope.ts.
 */

import { sha256 } from '@noble/hashes/sha256'
import { keccak_256 } from '@noble/hashes/sha3'
import { jcsCanonicalBytes, jcsStringify } from './jcs.js'
import type { SpendEnvelope, SignedEnvelope } from '../types.js'

/** Options for building a SpendEnvelope */
export interface BuildEnvelopeOptions {
  agentId: string
  issuerAddress: string       // pq1 + 40 hex chars (derived from pubkey)
  maxAmount: number
  currency: string
  allowedRecipients: string[]
  rail?: string
  ttlSeconds?: number
  startsInSeconds?: number
  /** Override the nonce (default: random 128-bit hex) */
  nonce?: string
}

/**
 * Derive the PQSafe issuer address from an ML-DSA-65 public key.
 * Format: pq1 + hex(keccak-256(pubkey)[0:20])
 */
export function deriveIssuerAddress(publicKeyHex: string): string {
  const pkBytes = hexToBytes(publicKeyHex)
  const hash = keccak_256(pkBytes)
  return 'pq1' + bytesToHex(hash.slice(0, 20))
}

/**
 * Build a SpendEnvelope (unsigned payload).
 */
export function buildEnvelope(opts: BuildEnvelopeOptions): SpendEnvelope {
  const now = Math.floor(Date.now() / 1000)
  const nonce = opts.nonce ?? generateNonce()

  return {
    version: 1,
    issuer: opts.issuerAddress,
    agent: opts.agentId,
    maxAmount: opts.maxAmount,
    currency: opts.currency.toUpperCase(),
    allowedRecipients: opts.allowedRecipients,
    validFrom: now + (opts.startsInSeconds ?? 0),
    validUntil: now + (opts.ttlSeconds ?? 3600),
    nonce,
    ...(opts.rail ? { rail: opts.rail } : {}),
  }
}

/**
 * Get the canonical bytes for a SpendEnvelope.
 * This is what ML-DSA-65 signs over (raw JCS, no pre-hash).
 */
export function envelopeCanonicalBytes(envelope: SpendEnvelope): Uint8Array {
  return jcsCanonicalBytes(envelope)
}

/**
 * Get the canonical JSON string for a SpendEnvelope (for display/debug).
 */
export function envelopeCanonicalJson(envelope: SpendEnvelope): string {
  return jcsStringify(envelope)
}

/**
 * Wrap a signed payload into a SignedEnvelope wire format.
 */
export function wrapSigned(
  envelope: SpendEnvelope,
  signatureHex: string,
  publicKeyHex: string
): SignedEnvelope {
  return {
    envelopeJson: envelopeCanonicalJson(envelope),
    signature: signatureHex,
    dsaPublicKey: publicKeyHex,
  }
}

/**
 * Compute a short hex fingerprint of a public key (first 8 bytes of SHA-256).
 */
export function publicKeyFingerprint(publicKeyHex: string): string {
  const pkBytes = hexToBytes(publicKeyHex)
  const digest = sha256(pkBytes)
  return bytesToHex(digest.slice(0, 8))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string (odd length)')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return bytesToHex(bytes)
}
