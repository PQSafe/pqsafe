/**
 * Shared types for PQSafe AgentPay SDK
 */

/** Payment rails supported by the router */
export type Rail = 'airwallex' | 'wise' | 'stripe' | 'usdc-base' | 'x402'

/** Hex-encoded bytes */
export type HexString = string

/** ISO 4217 currency code */
export type CurrencyCode = string

/** A PQSafe wallet address (pq1 + 20-byte keccak hex) */
export type PQAddress = string

/** Signed spend envelope ready for agent use */
export interface SignedEnvelope {
  /** The canonical JSON of the envelope (UTF-8 encoded, deterministic) */
  envelopeJson: string
  /** ML-DSA-65 signature over envelopeJson bytes, hex-encoded */
  signature: HexString
  /** ML-DSA-65 public key of the issuer, hex-encoded */
  dsaPublicKey: HexString
}

/** A payment request submitted by an agent */
export interface PaymentRequest {
  /** Recipient address (bank account, crypto address, etc — rail-specific) */
  recipient: string
  /** Amount in the envelope's currency */
  amount: number
  /** Human-readable memo / reference */
  memo?: string
}

/** Result returned by any rail connector */
export interface PaymentResult {
  success: boolean
  rail: Rail
  /** Rail-specific transaction ID */
  txId: string
  /** Amount debited */
  amount: number
  currency: CurrencyCode
  recipient: string
  /** ISO timestamp */
  executedAt: string
  /** Any rail-specific metadata */
  meta?: Record<string, unknown>
}
