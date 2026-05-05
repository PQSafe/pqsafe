/**
 * types.ts — shared type definitions for @pqsafe/cli
 *
 * Wire formats match the PQSafe AgentPay SDK (agent-pay package) exactly.
 */

/** Core SpendEnvelope fields — must match SpendEnvelopeSchema in agent-pay */
export interface SpendEnvelope {
  /** Schema version — must be 1 */
  version: 1
  /** PQSafe address: pq1 + 20-byte keccak-256 of ML-DSA-65 pubkey (hex) */
  issuer: string
  /** Agent identifier (free-form, 1-128 chars) */
  agent: string
  /** Maximum total spend amount (positive) */
  maxAmount: number
  /** ISO 4217 currency code or crypto token symbol (3-5 chars) */
  currency: string
  /** Allowlist of recipients (rail-specific format). Must be non-empty. */
  allowedRecipients: string[]
  /** Unix timestamp (seconds) — not valid before */
  validFrom: number
  /** Unix timestamp (seconds) — expires after */
  validUntil: number
  /** 128-bit random nonce (32 hex chars) — prevents replay attacks */
  nonce: string
  /** Optional: constrain to a single payment rail */
  rail?: string
}

/**
 * SignedEnvelope — wire format sent to agents and submitted to the API.
 * Matches SignedEnvelope in agent-pay/src/types.ts.
 */
export interface SignedEnvelope {
  /** RFC 8785 canonical JSON of the SpendEnvelope (UTF-8 string) */
  envelopeJson: string
  /** ML-DSA-65 signature over envelopeJson bytes, hex-encoded */
  signature: string
  /** ML-DSA-65 public key, hex-encoded (1952 bytes = 3904 hex chars) */
  dsaPublicKey: string
}

/** Issuer keypair as stored in ~/.pqsafe/issuer_<name>_keypair.json */
export interface IssuerKeypair {
  version: string
  created_at: string
  alg: 'ML-DSA-65'
  public_hex: string
  secret_hex: string
  seed_hex: string
  note?: string
}

/** API response from POST /v1/mandates/verify */
export interface ApiVerifyResponse {
  valid: boolean
  reason?: string
  envelope_id?: string
  envelope?: {
    maxAmount?: number
    currency?: string
    allowedRecipients?: string[]
    nonce?: string
    agent?: string
    issuer?: string
    validUntil?: number
  }
}

/** API response from POST /v1/mandates/revoke */
export interface ApiRevokeResponse {
  ok: boolean
  revoked_at?: string
  reason?: string
}

/** API response from GET /v1/audit/:id */
export interface ApiAuditResponse {
  id: string
  event_type: string
  timestamp: string
  details?: Record<string, unknown>
}
