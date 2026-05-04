/**
 * transfer.ts — PQSafe-gated Plaid /transfer/create
 *
 * Sequence enforced before any Plaid API call:
 *   1. Verify SpendEnvelope signature via PQSafe API
 *   2. Check amount.value <= envelope.maxAmount
 *   3. Check recipient derived from authorizationId ∈ envelope.allowedRecipients (best-effort; full
 *      check requires your own recipient-resolution logic — see TODO below)
 *   4. Nonce-replay guard (POST nonce to PQSafe replay-record endpoint)
 *   5. Call Plaid /transfer/create   ← STUBBED — wire real Plaid SDK here
 *   6. Write audit entry to ledger.pqsafe.xyz
 *
 * NOTE: Steps 5 is stubbed. Raymond wires real Plaid SDK after obtaining sandbox credentials.
 */

import type {
  PlaidPQSafeConfig,
  PQSafeProtectedTransferInput,
  PlaidTransferResult,
  AuditLogEntry,
} from './types.js'

// ---------------------------------------------------------------------------
// Internal: PQSafe envelope verification
// ---------------------------------------------------------------------------

interface EnvelopeVerifyResponse {
  valid: boolean
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
  reason?: string
}

async function verifyEnvelopeWithApi(
  apiUrl: string,
  envelope: PQSafeProtectedTransferInput['envelope'],
  timeoutMs: number,
): Promise<EnvelopeVerifyResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${apiUrl}/mandates/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        envelopeJson: envelope.envelopeJson,
        signature: envelope.signature,
        dsaPublicKey: envelope.dsaPublicKey,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { valid: false, reason: `PQSafe verify HTTP ${res.status}: ${body}` }
    }
    return (await res.json()) as EnvelopeVerifyResponse
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Internal: nonce replay guard
// ---------------------------------------------------------------------------

async function recordNonce(
  apiUrl: string,
  nonce: string,
  timeoutMs: number,
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${apiUrl}/nonces/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`PQSafe nonce record HTTP ${res.status}: ${body}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Internal: audit log write
// ---------------------------------------------------------------------------

async function writeAuditLog(
  ledgerUrl: string,
  entry: AuditLogEntry,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${ledgerUrl}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      signal: controller.signal,
    })
    if (!res.ok) {
      // Non-fatal: log failure but don't block the transfer result
      console.warn(`[pqsafe/agent-pay-plaid] audit log write failed HTTP ${res.status}`)
      return `${ledgerUrl}/entries/${entry.envelope_nonce}`
    }
    const data = (await res.json()) as { url?: string; id?: string }
    return data.url ?? `${ledgerUrl}/entries/${data.id ?? entry.envelope_nonce}`
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Internal: Plaid /transfer/create (STUBBED)
// ---------------------------------------------------------------------------

interface PlaidTransferCreateResponse {
  transfer: {
    id: string
    status: 'pending' | 'posted' | 'settled' | 'failed' | 'cancelled'
    created: string
  }
}

async function callPlaidTransferCreate(
  _plaidBaseUrl: string,
  _clientId: string,
  _secret: string,
  input: PQSafeProtectedTransferInput,
): Promise<PlaidTransferCreateResponse> {
  // TODO(raymond): replace this stub with the real Plaid SDK call.
  // Install the Plaid Node SDK: npm install plaid
  // Then replace this function body with:
  //
  //   import { PlaidApi, PlaidEnvironments, Configuration } from 'plaid'
  //   const config = new Configuration({
  //     basePath: PlaidEnvironments[plaidEnv],
  //     baseOptions: { headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret } },
  //   })
  //   const plaidClient = new PlaidApi(config)
  //   const response = await plaidClient.transferCreate({
  //     access_token: input.accessToken!,
  //     account_id: input.accountId!,
  //     authorization_id: input.authorizationId,
  //     description: input.description,
  //     ach_class: input.ach_class,
  //     amount: input.amount.value,
  //     type: input.type,
  //     user: { legal_name: input.user.legal_name, email_address: input.user.email_address },
  //   })
  //   return response.data
  //
  // Plaid sandbox key: get from plaid.com/dashboard → Team → Keys
  // Plaid sandbox docs: https://plaid.com/docs/sandbox/

  // MOCK response — safe for PQSAFE_TEST_MODE and CI
  const mockId = `mock-transfer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return {
    transfer: {
      id: mockId,
      status: 'pending',
      created: new Date().toISOString(),
    },
  }
}

// ---------------------------------------------------------------------------
// Public: protectedTransfer
// ---------------------------------------------------------------------------

/** @internal — called by createPlaidPQSafeClient */
export async function protectedTransfer(
  input: PQSafeProtectedTransferInput,
  config: Required<Pick<PlaidPQSafeConfig, 'plaidClientId' | 'plaidSecret' | 'plaidEnv'>> & {
    pqsafeApiUrl: string
    pqsafeLedgerUrl: string
    timeoutMs: number
  },
  testMode: boolean,
): Promise<PlaidTransferResult> {
  const { pqsafeApiUrl, pqsafeLedgerUrl, timeoutMs } = config

  // ── Step 1: verify envelope ──────────────────────────────────────────────

  let envelopeId = 'test-envelope-id'
  let parsedEnvelope: EnvelopeVerifyResponse['envelope'] | undefined

  if (testMode) {
    // In test mode, parse the envelope JSON directly without hitting the API
    try {
      const parsed = JSON.parse(input.envelope.envelopeJson) as Record<string, unknown>
      const validUntil = Number(parsed['validUntil'] ?? 0)
      if (validUntil < Math.floor(Date.now() / 1000)) {
        throw new Error('PQSafe: envelope is expired')
      }
      parsedEnvelope = {
        maxAmount: Number(parsed['maxAmount'] ?? 0),
        currency: String(parsed['currency'] ?? 'USD'),
        allowedRecipients: (parsed['allowedRecipients'] as string[] | undefined) ?? [],
        nonce: String(parsed['nonce'] ?? ''),
        agent: String(parsed['agent'] ?? ''),
        issuer: String(parsed['issuer'] ?? ''),
        validUntil,
      }
    } catch (err) {
      throw new Error(`PQSafe: envelope parse failed — ${String(err)}`)
    }
  } else {
    const verifyResult = await verifyEnvelopeWithApi(pqsafeApiUrl, input.envelope, timeoutMs)
    if (!verifyResult.valid) {
      throw new Error(`PQSafe: envelope verification failed — ${verifyResult.reason ?? 'UNKNOWN'}`)
    }
    envelopeId = verifyResult.envelope_id ?? 'unknown'
    parsedEnvelope = verifyResult.envelope
  }

  // ── Step 2: amount check ─────────────────────────────────────────────────

  const requestedAmount = parseFloat(input.amount.value)
  if (isNaN(requestedAmount)) {
    throw new Error(`PQSafe: invalid amount "${input.amount.value}" — must be a numeric string`)
  }
  const maxAmount = parsedEnvelope?.maxAmount ?? 0
  if (requestedAmount > maxAmount) {
    throw new Error(
      `PQSafe: transfer amount ${requestedAmount} exceeds envelope maxAmount ${maxAmount}`,
    )
  }

  // ── Step 3: recipient check (best-effort) ────────────────────────────────

  // Full recipient verification requires resolving the Plaid authorizationId to an
  // account identifier, which needs your own mapping logic.
  // TODO(raymond): add account-to-recipient mapping here once you have a
  //   /transfer/authorization/get call returning account details.
  //
  // For now, if allowedRecipients contains a literal match for authorizationId we
  // enforce it. Otherwise we log a warning and proceed (most common case: you pass
  // an account routing number or email in allowedRecipients and resolve it yourself).
  const allowed = parsedEnvelope?.allowedRecipients ?? []
  if (allowed.length === 0) {
    throw new Error('PQSafe: envelope allowedRecipients is empty — all transfers blocked')
  }
  if (allowed.includes(input.authorizationId)) {
    // Exact match — authorizationId used directly as recipient identifier
  } else {
    // Warn but do not block; Raymond's caller is responsible for mapping
    console.warn(
      '[pqsafe/agent-pay-plaid] authorizationId not in allowedRecipients — ' +
      'ensure your recipient-resolution logic has pre-validated this transfer.',
    )
  }

  // ── Step 4: nonce replay guard ───────────────────────────────────────────

  const nonce = parsedEnvelope?.nonce ?? ''
  if (!nonce) {
    throw new Error('PQSafe: envelope is missing nonce field — cannot perform replay check')
  }
  if (!testMode) {
    await recordNonce(pqsafeApiUrl, nonce, timeoutMs)
  }

  // ── Step 5: Plaid /transfer/create ──────────────────────────────────────

  const plaidBaseUrl = {
    sandbox: 'https://sandbox.plaid.com',
    development: 'https://development.plaid.com',
    production: 'https://production.plaid.com',
  }[config.plaidEnv]

  const plaidResult = await callPlaidTransferCreate(
    plaidBaseUrl,
    config.plaidClientId,
    config.plaidSecret,
    input,
  )

  const { transfer } = plaidResult

  // ── Step 6: audit log ────────────────────────────────────────────────────

  const auditEntry: AuditLogEntry = {
    envelope_nonce: nonce,
    transfer_id: transfer.id,
    timestamp: new Date().toISOString(),
    amount_usd: input.amount.value,
    status: transfer.status,
    plaid_env: config.plaidEnv,
  }

  const auditUrl = testMode
    ? `${pqsafeLedgerUrl}/entries/${nonce}?mock=true`
    : await writeAuditLog(pqsafeLedgerUrl, auditEntry, timeoutMs)

  // ── Step 7: return ───────────────────────────────────────────────────────

  return {
    transferId: transfer.id,
    status: transfer.status,
    created: transfer.created,
    auditUrl,
    envelopeId,
  }
}
