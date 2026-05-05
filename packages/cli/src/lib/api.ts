/**
 * api.ts — HTTP client for api.pqsafe.xyz
 *
 * Default base URL: https://api.pqsafe.xyz
 * Override via PQSAFE_API_URL env var (e.g. while DNS propagates)
 *
 * Wire format for POST /v1/mandates/verify:
 *   { envelopeJson, signature, dsaPublicKey }  — flat at top level
 */

import type { SignedEnvelope, ApiVerifyResponse, ApiRevokeResponse, ApiAuditResponse } from '../types.js'

function baseUrl(): string {
  return (
    process.env['PQSAFE_API_URL'] ??
    'https://api.pqsafe.xyz'
  )
}

async function apiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<T> {
  const url = `${baseUrl()}${path}`
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': '@pqsafe/cli/0.1.0',
      ...headers,
    },
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    throw new Error(`Network error calling ${url}: ${(err as Error).message}`)
  }

  if (!res.ok) {
    let detail = ''
    try {
      const errBody = await res.text()
      detail = errBody ? `: ${errBody}` : ''
    } catch {
      // ignore
    }
    throw new Error(`API error ${res.status} from ${url}${detail}`)
  }

  return res.json() as Promise<T>
}

/**
 * POST /v1/mandates/verify — verify a SignedEnvelope via the PQSafe API.
 *
 * Sends the flat SignedEnvelope fields (envelopeJson, signature, dsaPublicKey)
 * at the top level of the request body — matches Worker expectations.
 */
export async function apiVerify(signed: SignedEnvelope): Promise<ApiVerifyResponse> {
  return apiRequest<ApiVerifyResponse>('POST', '/v1/mandates/verify', {
    envelopeJson: signed.envelopeJson,
    signature: signed.signature,
    dsaPublicKey: signed.dsaPublicKey,
  })
}

/**
 * POST /v1/mandates/revoke — revoke a SignedEnvelope.
 * Requires REVOKE_API_KEY env var to be set.
 */
export async function apiRevoke(
  signed: SignedEnvelope,
  reason?: string
): Promise<ApiRevokeResponse> {
  const apiKey = process.env['REVOKE_API_KEY']
  if (!apiKey) {
    throw new Error(
      'REVOKE_API_KEY environment variable is required for revocation.\n' +
      'Set it to your issuer revocation key.'
    )
  }

  return apiRequest<ApiRevokeResponse>(
    'POST',
    '/v1/mandates/revoke',
    {
      envelopeJson: signed.envelopeJson,
      signature: signed.signature,
      dsaPublicKey: signed.dsaPublicKey,
      reason: reason ?? 'manual_revocation',
    },
    { Authorization: `Bearer ${apiKey}` }
  )
}

/**
 * GET /v1/audit/:id — look up an audit log entry
 */
export async function apiAudit(auditId: string): Promise<ApiAuditResponse> {
  return apiRequest<ApiAuditResponse>('GET', `/v1/audit/${encodeURIComponent(auditId)}`)
}
