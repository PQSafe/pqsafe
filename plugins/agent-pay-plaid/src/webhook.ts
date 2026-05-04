/**
 * webhook.ts — Plaid webhook verification with PQSafe audit cross-reference
 *
 * Plaid uses JWT-based webhook verification (RS256).
 * Docs: https://plaid.com/docs/api/webhooks/webhook-verification/
 *
 * This module:
 *   1. Verifies the Plaid-Verification JWT header using Plaid's JWKS endpoint
 *   2. Cross-references the webhook transfer_id with the PQSafe audit log
 *
 * NOTE: The Plaid JWT header parsing is STUBBED — wire real JWT verification
 * with a library like `jose` once you have Plaid sandbox credentials.
 */

import type { PlaidWebhookVerifyResult } from './types.js'

// ---------------------------------------------------------------------------
// Internal: parse Plaid webhook body
// ---------------------------------------------------------------------------

interface PlaidWebhookBody {
  webhook_type?: string
  webhook_code?: string
  transfer_id?: string
  transfer_event_id?: string
  error?: unknown
}

function parseWebhookBody(body: string): PlaidWebhookBody {
  try {
    return JSON.parse(body) as PlaidWebhookBody
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Internal: Plaid JWT signature verification (STUBBED)
// ---------------------------------------------------------------------------

async function verifyPlaidJwtHeader(
  headers: Record<string, string>,
  body: string,
  _plaidEnv: 'sandbox' | 'development' | 'production',
): Promise<{ valid: boolean; reason?: string }> {
  // TODO(raymond): replace this stub with real JWT verification.
  // Install: npm install jose
  // Then:
  //
  //   import { createRemoteJWKSet, jwtVerify } from 'jose'
  //   const token = headers['plaid-verification'] ?? headers['Plaid-Verification']
  //   if (!token) return { valid: false, reason: 'MISSING_PLAID_VERIFICATION_HEADER' }
  //
  //   // Plaid rotates keys — fetch from their JWKS endpoint
  //   const JWKS = createRemoteJWKSet(
  //     new URL('https://production.plaid.com/api/webhook_verification_key/list')
  //   )
  //   try {
  //     const { payload } = await jwtVerify(token, JWKS, { algorithms: ['ES256'] })
  //     // Verify body hash matches the JWT claim
  //     const bodyHash = payload['request_body_sha256'] as string | undefined
  //     if (bodyHash) {
  //       const { createHash } = await import('crypto')
  //       const actualHash = createHash('sha256').update(body).digest('hex')
  //       if (actualHash !== bodyHash) return { valid: false, reason: 'BODY_HASH_MISMATCH' }
  //     }
  //     return { valid: true }
  //   } catch (err) {
  //     return { valid: false, reason: `JWT_INVALID: ${String(err)}` }
  //   }
  //
  // Plaid webhook verification docs:
  //   https://plaid.com/docs/api/webhooks/webhook-verification/

  // MOCK: in test mode, accept any request that has the header present
  const token = headers['plaid-verification'] ?? headers['Plaid-Verification']
  if (!token && process.env['PQSAFE_TEST_MODE'] !== 'true') {
    return { valid: false, reason: 'MISSING_PLAID_VERIFICATION_HEADER' }
  }
  return { valid: true }
}

// ---------------------------------------------------------------------------
// Internal: audit log cross-reference
// ---------------------------------------------------------------------------

async function lookupAuditLog(
  ledgerUrl: string,
  transferId: string,
  timeoutMs: number,
): Promise<{ envelope_id?: string; found: boolean }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${ledgerUrl}/entries?transfer_id=${encodeURIComponent(transferId)}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return { found: false }
    const data = (await res.json()) as { envelope_id?: string }
    return { envelope_id: data.envelope_id, found: true }
  } catch {
    return { found: false }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Public: verifyPlaidWebhook
// ---------------------------------------------------------------------------

/** @internal — called by createPlaidPQSafeClient */
export async function verifyPlaidWebhook(
  headers: Record<string, string>,
  body: string,
  plaidEnv: 'sandbox' | 'development' | 'production',
  pqsafeLedgerUrl: string,
  timeoutMs: number,
  testMode: boolean,
): Promise<PlaidWebhookVerifyResult> {
  // ── Step 1: Plaid JWT verification ──────────────────────────────────────

  if (!testMode) {
    const jwtResult = await verifyPlaidJwtHeader(headers, body, plaidEnv)
    if (!jwtResult.valid) {
      return { valid: false, reason: jwtResult.reason ?? 'PLAID_JWT_INVALID' }
    }
  }

  // ── Parse body ──────────────────────────────────────────────────────────

  const parsed = parseWebhookBody(body)
  const transferId = parsed.transfer_id

  // ── Step 2: audit log cross-reference ──────────────────────────────────

  if (transferId && !testMode) {
    const audit = await lookupAuditLog(pqsafeLedgerUrl, transferId, timeoutMs)
    return {
      valid: true,
      envelope_id: audit.envelope_id,
      webhook_type: parsed.webhook_type,
      webhook_code: parsed.webhook_code,
    }
  }

  // Test mode or no transfer_id — return valid with whatever we parsed
  return {
    valid: true,
    envelope_id: testMode ? 'test-envelope-id' : undefined,
    webhook_type: parsed.webhook_type,
    webhook_code: parsed.webhook_code,
  }
}
