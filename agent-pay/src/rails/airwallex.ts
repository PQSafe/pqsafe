/**
 * Airwallex rail connector — real sandbox + live integration.
 *
 * Flow:
 *   1. OAuth2 client-credentials login → bearer token (cached per process)
 *   2. Optional: ensure beneficiary exists (cached by recipient string)
 *   3. POST /transfers/create with idempotency key = envelope.nonce + timestamp
 *   4. Map Airwallex response → PaymentResult
 *
 * Falls back to a mock PaymentResult when credentials are absent or
 * PQSAFE_MOCK_MODE=1 is set. Video demo runs in mock mode by default so it
 * works on Raymond's machine without sandbox credentials — once sandbox creds
 * are added to the environment, the exact same code path hits real Airwallex.
 *
 * Docs: https://www.airwallex.com/docs/api
 */

import type { PaymentRequest, PaymentResult } from '../types.js'
import type { SpendEnvelope } from '../envelope.js'
import { getAgentPayConfig, getAirwallexBaseUrl } from '../config.js'

// ---------------------------------------------------------------------------
// Token caching
// ---------------------------------------------------------------------------

interface CachedToken {
  token: string
  expiresAt: number
}
let tokenCache: CachedToken | null = null

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt > now + 30_000) {
    return tokenCache.token
  }

  const cfg = getAgentPayConfig()
  if (!cfg.airwallex.clientId || !cfg.airwallex.apiKey) {
    throw new Error(
      'PQSafe: AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY must be set before calling live Airwallex.',
    )
  }

  const res = await fetch(`${getAirwallexBaseUrl()}/authentication/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': cfg.airwallex.clientId,
      'x-api-key': cfg.airwallex.apiKey,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airwallex auth failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { token: string; expires_at?: string }
  const expiresAt = data.expires_at
    ? Date.parse(data.expires_at)
    : now + 30 * 60_000

  tokenCache = { token: data.token, expiresAt }
  return data.token
}

// ---------------------------------------------------------------------------
// Transfer execution
// ---------------------------------------------------------------------------

interface AirwallexTransferResponse {
  id: string
  status: string
  request_id: string
  source_amount?: number
  source_currency?: string
  created_at?: string
  [k: string]: unknown
}

async function createTransfer(
  token: string,
  body: Record<string, unknown>,
): Promise<AirwallexTransferResponse> {
  const res = await fetch(`${getAirwallexBaseUrl()}/transfers/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text()
    // Map common Airwallex error codes to structured PQSafe errors
    if (errBody.includes('insufficient_funds')) {
      throw new Error('PQSafe/Airwallex: INSUFFICIENT_FUNDS')
    }
    if (errBody.includes('beneficiary_not_found')) {
      throw new Error('PQSafe/Airwallex: INVALID_RECIPIENT')
    }
    if (errBody.includes('compliance_check_failed')) {
      throw new Error('PQSafe/Airwallex: COMPLIANCE_BLOCK')
    }
    throw new Error(`Airwallex /transfers/create failed (${res.status}): ${errBody}`)
  }

  return (await res.json()) as AirwallexTransferResponse
}

// ---------------------------------------------------------------------------
// Public rail interface
// ---------------------------------------------------------------------------

export async function executePayment(
  envelope: SpendEnvelope,
  request: PaymentRequest,
): Promise<PaymentResult> {
  const cfg = getAgentPayConfig()

  // -------------------------------------------------------------------------
  // Mock path — used when no creds present, or PQSAFE_MOCK_MODE=1.
  // The full signing + verification + guard-rail pipeline still runs end-to-end;
  // only the final wire call to Airwallex is mocked. This is sufficient for
  // the YC video demo when a sandbox account isn't wired in yet.
  // -------------------------------------------------------------------------
  if (cfg.mockMode) {
    const mockTxId = `awx_sbx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    return {
      success: true,
      rail: 'airwallex',
      txId: mockTxId,
      amount: request.amount,
      currency: envelope.currency,
      recipient: request.recipient,
      executedAt: new Date().toISOString(),
      meta: {
        mock: true,
        env: cfg.airwallex.env,
        agent: envelope.agent,
        issuer: envelope.issuer,
        envelopeNonce: envelope.nonce,
        memo: request.memo ?? null,
      },
    }
  }

  // -------------------------------------------------------------------------
  // Real path — hits live or sandbox Airwallex API
  // -------------------------------------------------------------------------
  const token = await getAccessToken()

  const body = {
    request_id: `${envelope.nonce}-${Date.now()}`,
    source_currency: envelope.currency,
    transfer_currency: envelope.currency,
    transfer_amount: request.amount,
    transfer_method: 'SWIFT',
    reason: 'goods_purchase',
    reference: request.memo ?? `AgentPay/${envelope.agent}`,
    beneficiary: {
      type: 'BANK_ACCOUNT',
      bank_details: {
        account_number: request.recipient,
      },
    },
  }

  const transfer = await createTransfer(token, body)

  return {
    success: transfer.status !== 'FAILED',
    rail: 'airwallex',
    txId: transfer.id,
    amount: request.amount,
    currency: envelope.currency,
    recipient: request.recipient,
    executedAt: transfer.created_at ?? new Date().toISOString(),
    meta: {
      mock: false,
      env: cfg.airwallex.env,
      agent: envelope.agent,
      issuer: envelope.issuer,
      envelopeNonce: envelope.nonce,
      airwallexStatus: transfer.status,
      airwallexRequestId: transfer.request_id,
    },
  }
}
