/**
 * Wise (formerly TransferWise) rail connector.
 *
 * Flow:
 *   1. GET /v1/profiles → fetch business profile ID (cached)
 *   2. POST /v2/quotes → create a quote for the transfer amount + currency
 *   3. POST /v1/accounts → create or reuse a recipient account
 *   4. POST /v3/profiles/{profileId}/transfers → create transfer
 *   5. POST /v3/profiles/{profileId}/transfers/{id}/payments → fund transfer
 *   6. Map Wise response → PaymentResult
 *
 * Wise sandbox: https://sandbox.transferwise.tech
 * Wise production: https://api.transferwise.com
 *
 * Required env vars:
 *   WISE_API_KEY       — API key from Wise dashboard (Settings → API tokens)
 *   WISE_ENV           — "sandbox" (default) or "live"
 *
 * Docs: https://docs.wise.com/api-docs/api-reference
 */

import type { PaymentRequest, PaymentResult } from '../types.js'
import type { SpendEnvelope } from '../envelope.js'

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function readEnv(key: string): string | null {
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key] as string
  }
  return null
}

function getWiseConfig() {
  const apiKey = readEnv('WISE_API_KEY')
  const env = readEnv('WISE_ENV') === 'live' ? 'live' : 'sandbox'
  const mockMode = readEnv('PQSAFE_MOCK_MODE') === '1' || !apiKey
  const baseUrl = env === 'live'
    ? 'https://api.transferwise.com'
    : 'https://api.sandbox.transferwise.tech'
  return { apiKey, env, mockMode, baseUrl }
}

// ---------------------------------------------------------------------------
// Wise API helpers
// ---------------------------------------------------------------------------

async function wiseRequest(
  baseUrl: string,
  apiKey: string,
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json() as Record<string, unknown>

  if (!res.ok) {
    const msg = (data as { errors?: Array<{ message: string }> }).errors?.[0]?.message
      ?? JSON.stringify(data)
    if (msg.includes('balance') || msg.includes('insufficient')) {
      throw new Error('PQSafe/Wise: INSUFFICIENT_FUNDS')
    }
    if (msg.includes('account') || msg.includes('recipient')) {
      throw new Error('PQSafe/Wise: INVALID_RECIPIENT')
    }
    if (msg.includes('compliance') || msg.includes('blocked')) {
      throw new Error('PQSafe/Wise: COMPLIANCE_BLOCK')
    }
    throw new Error(`Wise API error (${res.status}): ${msg}`)
  }

  return data
}

// Profile ID cache (one profile per API key in sandbox)
let profileIdCache: number | null = null

async function getProfileId(baseUrl: string, apiKey: string): Promise<number> {
  if (profileIdCache !== null) return profileIdCache

  const profiles = await wiseRequest(baseUrl, apiKey, 'GET', '/v1/profiles') as unknown as Array<{
    id: number
    type: string
  }>

  // Prefer business profile
  const profile = profiles.find((p) => p.type === 'BUSINESS') ?? profiles[0]
  if (!profile) throw new Error('Wise: no profiles found for this API key')

  profileIdCache = profile.id
  return profile.id
}

// ---------------------------------------------------------------------------
// Parse recipient — detect IBAN, sort code (UK), or routing number (US)
// ---------------------------------------------------------------------------

interface WiseBankDetails {
  type: 'iban' | 'sort_code' | 'aba' | 'swift_code'
  details: Record<string, string>
}

function parseRecipient(recipient: string): WiseBankDetails {
  // IBAN: starts with 2-letter country code + 2 digits + up to 30 alphanum
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(recipient.replace(/\s/g, ''))) {
    const iban = recipient.replace(/\s/g, '')
    return {
      type: 'iban',
      details: {
        IBAN: iban,
        legalType: 'PRIVATE',
        accountHolderName: 'PQSafe Recipient',
      },
    }
  }

  // UK sort code: 6 digits (with or without dashes) + 8-digit account number
  // Format: "60-00-01 12345678" or "600001/12345678"
  const ukMatch = recipient.match(/^(\d{2}[-]?\d{2}[-]?\d{2})[/ ](\d{8})$/)
  if (ukMatch) {
    return {
      type: 'sort_code',
      details: {
        sortCode: ukMatch[1].replace(/-/g, ''),
        accountNumber: ukMatch[2],
        legalType: 'PRIVATE',
        accountHolderName: 'PQSafe Recipient',
      },
    }
  }

  // US ABA routing: "021000021/000123456789" (routing/account)
  const usMatch = recipient.match(/^(\d{9})[/ ](\d{6,17})$/)
  if (usMatch) {
    return {
      type: 'aba',
      details: {
        abartn: usMatch[1],
        accountNumber: usMatch[2],
        accountType: 'CHECKING',
        legalType: 'PRIVATE',
        accountHolderName: 'PQSafe Recipient',
      },
    }
  }

  // Default: treat as SWIFT/BIC beneficiary (for domain-style recipients)
  return {
    type: 'swift_code',
    details: {
      BIC: 'TRWIBEB1XXX', // Wise sandbox BIC
      accountNumber: recipient,
      accountHolderName: 'PQSafe Recipient',
    },
  }
}

// ---------------------------------------------------------------------------
// Public rail interface
// ---------------------------------------------------------------------------

export async function executePayment(
  envelope: SpendEnvelope,
  request: PaymentRequest,
): Promise<PaymentResult> {
  const { apiKey, env, mockMode, baseUrl } = getWiseConfig()

  // -------------------------------------------------------------------------
  // Mock path
  // -------------------------------------------------------------------------
  if (mockMode) {
    const mockTxId = `wise_sbx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    return {
      success: true,
      rail: 'wise',
      txId: mockTxId,
      amount: request.amount,
      currency: envelope.currency,
      recipient: request.recipient,
      executedAt: new Date().toISOString(),
      meta: {
        mock: true,
        env,
        agent: envelope.agent,
        issuer: envelope.issuer,
        envelopeNonce: envelope.nonce,
        memo: request.memo ?? null,
      },
    }
  }

  // -------------------------------------------------------------------------
  // Real path
  // -------------------------------------------------------------------------
  const profileId = await getProfileId(baseUrl, apiKey!)
  const currency = envelope.currency.toUpperCase()

  // 1. Create quote
  const quote = await wiseRequest(baseUrl, apiKey!, 'POST', '/v3/quotes', {
    sourceCurrency: currency,
    targetCurrency: currency,
    sourceAmount: request.amount,
    profile: profileId,
    payOut: 'BANK_TRANSFER',
  })

  // 2. Create recipient account
  const bankDetails = parseRecipient(request.recipient)
  const recipient = await wiseRequest(baseUrl, apiKey!, 'POST', '/v1/accounts', {
    currency: currency,
    type: bankDetails.type,
    profile: profileId,
    ownedByCustomer: false,
    accountHolderName: bankDetails.details.accountHolderName ?? 'PQSafe Recipient',
    details: bankDetails.details,
  })

  // 3. Create transfer
  const transfer = await wiseRequest(
    baseUrl,
    apiKey!,
    'POST',
    `/v3/profiles/${profileId}/transfers`,
    {
      targetAccount: (recipient as { id: number }).id,
      quoteUuid: (quote as { id: string }).id,
      customerTransactionId: `${envelope.nonce}-${Date.now()}`,
      details: {
        reference: request.memo ?? `AgentPay/${envelope.agent}`,
        transferPurpose: 'verification.transfers.purpose.pay.bills',
        sourceOfFunds: 'verification.source.of.funds.business.income',
      },
    },
  )

  const transferId = (transfer as { id: number }).id

  // 4. Fund transfer
  await wiseRequest(
    baseUrl,
    apiKey!,
    'POST',
    `/v3/profiles/${profileId}/transfers/${transferId}/payments`,
    { type: 'BALANCE' },
  )

  return {
    success: true,
    rail: 'wise',
    txId: String(transferId),
    amount: request.amount,
    currency: envelope.currency,
    recipient: request.recipient,
    executedAt: new Date().toISOString(),
    meta: {
      mock: false,
      env,
      agent: envelope.agent,
      issuer: envelope.issuer,
      envelopeNonce: envelope.nonce,
      wiseStatus: (transfer as { status?: string }).status ?? 'processing',
      wiseTransferId: transferId,
      memo: request.memo ?? null,
    },
  }
}
