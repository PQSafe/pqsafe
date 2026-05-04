/**
 * @pqsafe/agent-pay-plaid — Plaid Transfer API gated by PQSafe SpendEnvelope verification.
 *
 * Wraps Plaid's ACH transfer endpoints with post-quantum authorization:
 *   protectedTransfer  — /transfer/create gated by ML-DSA-65 signed SpendEnvelope
 *   verifyPlaidWebhook — Plaid JWT webhook verification + PQSafe audit cross-reference
 *
 * Strategic rationale: Plaid is a distinct ACH rail from Stripe. Integrating here lets
 * PQSafe agents reach accounts via Plaid's bank-link network without touching Stripe.
 * This forces any competing payment-auth layer to build Plaid coverage separately.
 *
 * ML-DSA-65 = NIST FIPS 204 (formerly Dilithium3)
 * Security level: NIST Level 3 (quantum-resistant)
 * Key sizes: pubkey 1952 B · secret key 4032 B · signature 3309 B
 *
 * Set PQSAFE_TEST_MODE=true to bypass network calls (local dev / CI).
 *
 * @see https://docs.pqsafe.xyz/agent-pay-plaid
 * @see https://plaid.com/docs/api/products/transfer/
 */

export type {
  PlaidPQSafeConfig,
  PQSafeProtectedTransferInput,
  PlaidTransferResult,
  PlaidWebhookVerifyResult,
  SignedEnvelopeRef,
  AchClass,
  TransferType,
  AuditLogEntry,
} from './types.js'

import { protectedTransfer as _protectedTransfer } from './transfer.js'
import { verifyPlaidWebhook as _verifyPlaidWebhook } from './webhook.js'
import type { PlaidPQSafeConfig, PQSafeProtectedTransferInput, PlaidTransferResult, PlaidWebhookVerifyResult } from './types.js'

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Plaid+PQSafe client.
 *
 * ```ts
 * import { createPlaidPQSafeClient } from '@pqsafe/agent-pay-plaid'
 *
 * const client = createPlaidPQSafeClient({
 *   plaidClientId: process.env.PLAID_CLIENT_ID!,
 *   plaidSecret: process.env.PLAID_SECRET!,
 *   plaidEnv: 'sandbox',
 * })
 * ```
 *
 * Set PQSAFE_TEST_MODE=true to run without Plaid credentials (sandbox mock).
 */
export function createPlaidPQSafeClient(cfg: PlaidPQSafeConfig) {
  const pqsafeApiUrl = (cfg.pqsafeApiUrl ?? 'https://api.pqsafe.xyz/v1').replace(/\/$/, '')
  const pqsafeLedgerUrl = (cfg.pqsafeLedgerUrl ?? 'https://ledger.pqsafe.xyz/v1').replace(/\/$/, '')
  const timeoutMs = cfg.timeoutMs ?? 30_000
  const testMode = process.env['PQSAFE_TEST_MODE'] === 'true'

  const resolvedConfig = {
    plaidClientId: cfg.plaidClientId,
    plaidSecret: cfg.plaidSecret,
    plaidEnv: cfg.plaidEnv,
    pqsafeApiUrl,
    pqsafeLedgerUrl,
    timeoutMs,
  }

  return {
    /**
     * Create a Plaid ACH transfer gated by PQSafe SpendEnvelope verification.
     *
     * Throws if:
     *   - envelope signature is invalid or expired
     *   - amount.value > envelope.maxAmount
     *   - envelope.allowedRecipients is empty
     *   - nonce replay is detected
     *
     * The underlying Plaid /transfer/create call is STUBBED until Raymond
     * wires the real Plaid SDK (see transfer.ts TODO).
     *
     * @example
     * ```ts
     * const result = await client.protectedTransfer({
     *   envelope: signedEnvelope,
     *   authorizationId: 'plaid-auth-id-xyz',
     *   amount: { currency: 'USD', value: '50.00' },
     *   description: 'Invoice payment',
     *   ach_class: 'ppd',
     *   user: { legal_name: 'Jane Smith', email_address: 'jane@example.com' },
     *   type: 'debit',
     * })
     * console.log(result.auditUrl) // https://ledger.pqsafe.xyz/v1/entries/...
     * ```
     */
    async protectedTransfer(
      input: PQSafeProtectedTransferInput,
    ): Promise<PlaidTransferResult> {
      return _protectedTransfer(input, resolvedConfig, testMode)
    },

    /**
     * Verify a Plaid webhook signature and cross-reference with the PQSafe audit log.
     *
     * Pass the raw request headers and body string exactly as received from Plaid.
     * The Plaid JWT verification step is STUBBED — see webhook.ts TODO for `jose`
     * integration once you have Plaid webhook signing keys.
     *
     * @example
     * ```ts
     * app.post('/webhooks/plaid', async (req, res) => {
     *   const result = await client.verifyPlaidWebhook(req.headers, req.rawBody)
     *   if (!result.valid) { res.status(400).end(); return }
     *   // process result.webhook_type / result.webhook_code
     *   res.status(200).end()
     * })
     * ```
     */
    async verifyPlaidWebhook(
      headers: Record<string, string>,
      body: string,
    ): Promise<PlaidWebhookVerifyResult> {
      return _verifyPlaidWebhook(
        headers,
        body,
        cfg.plaidEnv,
        pqsafeLedgerUrl,
        timeoutMs,
        testMode,
      )
    },
  }
}

export default createPlaidPQSafeClient
