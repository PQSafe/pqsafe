/**
 * @pqsafe/agent-pay-plaid — type definitions
 *
 * ML-DSA-65 = NIST FIPS 204 (formerly Dilithium3)
 * Security level: NIST Level 3 (quantum-resistant)
 * Key sizes: pubkey 1952 B · secret key 4032 B · signature 3309 B
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface PlaidPQSafeConfig {
  /** Plaid client_id from plaid.com/dashboard */
  plaidClientId: string
  /** Plaid secret for the chosen environment */
  plaidSecret: string
  /** Plaid environment — use 'sandbox' for development without real money */
  plaidEnv: 'sandbox' | 'development' | 'production'
  /**
   * PQSafe API base URL.
   * @default "https://api.pqsafe.xyz/v1"
   */
  pqsafeApiUrl?: string
  /**
   * PQSafe audit/ledger URL.
   * @default "https://ledger.pqsafe.xyz/v1"
   */
  pqsafeLedgerUrl?: string
  /** Fetch timeout in milliseconds for PQSafe API calls. @default 30000 */
  timeoutMs?: number
}

// ---------------------------------------------------------------------------
// Signed envelope (subset of @pqsafe/agent-pay SignedEnvelope)
// ---------------------------------------------------------------------------

export interface SignedEnvelopeRef {
  /** Canonical deterministic JSON of the SpendEnvelope (UTF-8, JCS) */
  envelopeJson: string
  /**
   * ML-DSA-65 signature over envelopeJson bytes, hex-encoded.
   * 3309 bytes = 6618 hex chars (NIST FIPS 204).
   */
  signature: string
  /**
   * ML-DSA-65 public key of the issuer, hex-encoded.
   * 1952 bytes = 3904 hex chars.
   */
  dsaPublicKey: string
}

// ---------------------------------------------------------------------------
// Transfer input / output
// ---------------------------------------------------------------------------

/** ACH class codes supported by Plaid Transfer */
export type AchClass = 'ppd' | 'ccd' | 'web' | 'tel'

/** Transfer direction from the perspective of the Plaid account */
export type TransferType = 'debit' | 'credit'

export interface PQSafeProtectedTransferInput {
  /** Signed SpendEnvelope authorizing this transfer */
  envelope: SignedEnvelopeRef
  /**
   * Plaid transfer_authorization_id obtained via /transfer/authorization/create.
   * Raymond: call Plaid SDK createTransferAuthorization first, then pass the ID here.
   */
  authorizationId: string
  /** Transfer amount — always USD for ACH */
  amount: { currency: 'USD'; value: string }
  /** Human-readable memo (max 15 chars for PPD, 10 for CCD) */
  description: string
  /** ACH class code */
  ach_class: AchClass
  /** End-user details passed to Plaid */
  user: { legal_name: string; email_address?: string }
  /** debit = pull money from account; credit = push money to account */
  type: TransferType
  /**
   * Optional Plaid access_token identifying the funding account.
   * Required in production; can be omitted in sandbox with mock mode.
   */
  accessToken?: string
  /**
   * Optional Plaid account_id (the specific account within access_token).
   * Required when access_token has multiple accounts.
   */
  accountId?: string
}

export interface PlaidTransferResult {
  /** Plaid-assigned transfer ID */
  transferId: string
  /** Transfer status returned by Plaid */
  status: 'pending' | 'posted' | 'settled' | 'failed' | 'cancelled'
  /** ISO 8601 timestamp of transfer creation */
  created: string
  /** PQSafe audit log URL for this transfer */
  auditUrl: string
  /** The envelope_id extracted from the verified envelope */
  envelopeId: string
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export interface PlaidWebhookVerifyResult {
  /** true if Plaid signature is valid AND event is recorded in the PQSafe audit log */
  valid: boolean
  /** PQSafe envelope_id tied to this transfer event (if found in audit log) */
  envelope_id?: string
  /** Plaid webhook_type from the decoded body */
  webhook_type?: string
  /** Plaid webhook_code from the decoded body */
  webhook_code?: string
  /** Reason string when valid=false */
  reason?: string
}

// ---------------------------------------------------------------------------
// Audit log entry shape (written to ledger.pqsafe.xyz)
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  /** PQSafe envelope nonce — uniquely identifies the authorization */
  envelope_nonce: string
  /** Plaid transfer_id */
  transfer_id: string
  /** ISO 8601 timestamp */
  timestamp: string
  /** Transfer amount in USD */
  amount_usd: string
  /** Plaid transfer status at time of creation */
  status: string
  /** Plaid environment used */
  plaid_env: 'sandbox' | 'development' | 'production'
}
