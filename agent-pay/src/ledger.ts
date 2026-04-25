/**
 * PQSafe AgentPay — anonymized ledger submission.
 *
 * After a successful payment, the SDK can optionally submit an anonymized
 * record to ledger.pqsafe.xyz (or a self-hosted instance).
 *
 * What is logged (no PII):
 *   - SHA-256 of the envelope JSON (not reversible — no contents exposed)
 *   - SHA-256 of the agent identifier string
 *   - Payment rail (airwallex, wise, etc.)
 *   - Amount bucket (one of 5 ranges — not the exact amount)
 *   - Currency code
 *   - Outcome (success / failed)
 *   - Unix timestamp (seconds)
 *
 * What is NOT logged:
 *   - Recipient addresses
 *   - Exact amounts
 *   - Issuer identity
 *   - Envelope contents
 *   - API keys or credentials
 *
 * To enable: set PQSAFE_LEDGER_URL and PQSAFE_LEDGER_API_KEY env vars.
 * Submission is best-effort — failures are silently swallowed so they
 * never interrupt payment execution.
 *
 * Self-hosted: deploy ledger/worker/ to your own Cloudflare Workers account
 * and point PQSAFE_LEDGER_URL at it.
 *
 * Public ledger: https://ledger.pqsafe.xyz
 */

import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import type { PaymentResult } from './types.js'
import type { SpendEnvelope } from './envelope.js'
import type { SignedEnvelope } from './types.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AmountBucket = '<10' | '10-100' | '100-1000' | '1000-10000' | '>10000'

export interface LedgerRecord {
  envelopeHash: string
  agentIdHash: string
  rail: string
  amountBucket: AmountBucket
  currency: string
  outcome: 'success' | 'failed'
  timestamp: number
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function readEnv(key: string): string | null {
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key] as string
  }
  return null
}

function getLedgerConfig(): { url: string | null; apiKey: string | null } {
  return {
    url: readEnv('PQSAFE_LEDGER_URL'),
    apiKey: readEnv('PQSAFE_LEDGER_API_KEY'),
  }
}

// ---------------------------------------------------------------------------
// Anonymization
// ---------------------------------------------------------------------------

function sha256Hex(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input)))
}

function toAmountBucket(amount: number): AmountBucket {
  if (amount < 10) return '<10'
  if (amount < 100) return '10-100'
  if (amount < 1000) return '100-1000'
  if (amount < 10000) return '1000-10000'
  return '>10000'
}

/**
 * Build an anonymized ledger record from a payment result.
 * No PII or sensitive data is included.
 */
export function buildLedgerRecord(
  signed: SignedEnvelope,
  envelope: SpendEnvelope,
  result: PaymentResult,
): LedgerRecord {
  return {
    envelopeHash: sha256Hex(signed.envelopeJson),
    agentIdHash: sha256Hex(envelope.agent),
    rail: result.rail,
    amountBucket: toAmountBucket(result.amount),
    currency: (result.currency ?? envelope.currency).toUpperCase().slice(0, 5),
    outcome: result.success ? 'success' : 'failed',
    timestamp: Math.floor(Date.now() / 1000),
  }
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

/**
 * Submit an anonymized payment record to the PQSafe ledger.
 *
 * Best-effort: never throws. Failures are logged to console.debug only.
 * Returns true if submitted successfully, false otherwise.
 */
export async function submitToLedger(record: LedgerRecord): Promise<boolean> {
  const { url, apiKey } = getLedgerConfig()
  if (!url) return false // no ledger configured — silent no-op

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/v1/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-Api-Key': apiKey } : {}),
      },
      body: JSON.stringify(record),
    })

    if (!res.ok && res.status !== 409) {
      // 409 = duplicate (already logged) — that's fine
      console.debug(`PQSafe/Ledger: submission failed (${res.status})`)
      return false
    }

    return true
  } catch (err) {
    // Network errors — never interrupt payment flow
    console.debug('PQSafe/Ledger: network error, skipping', err)
    return false
  }
}

/**
 * Auto-submit a payment result to the ledger (fire-and-forget).
 * Call this after a successful executeAgentPayment().
 *
 * No await needed — submission happens in background.
 */
export function autoSubmitToLedger(
  signed: SignedEnvelope,
  envelope: SpendEnvelope,
  result: PaymentResult,
): void {
  const { url } = getLedgerConfig()
  if (!url) return // no ledger configured

  const record = buildLedgerRecord(signed, envelope, result)
  // Fire-and-forget — don't block payment caller
  submitToLedger(record).catch(() => {
    // silently swallow
  })
}
