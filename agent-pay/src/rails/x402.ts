/**
 * x402 rail connector — HTTP 402 Payment Required micropayments.
 *
 * The x402 protocol lets HTTP servers request payment before serving content:
 *   1. Client makes HTTP request
 *   2. Server responds: 402 Payment Required + X-Payment-Requirements header
 *   3. Client constructs payment in the required format (USDC on Base is standard)
 *   4. Client re-sends the request with X-Payment header
 *   5. Server validates payment and returns content
 *
 * PQSafe x402 flow:
 *   1. `initiateX402Payment(url)` → fetch URL, parse 402 + payment requirements
 *   2. Validate requirements against SpendEnvelope (amount ceiling, currency, allowlist)
 *   3. Construct payment payload (on-chain USDC or signed off-chain receipt)
 *   4. Re-submit request with X-Payment header
 *   5. Return PaymentResult with the HTTP response body
 *
 * Current status: mock mode implemented. Real mode requires:
 *   - USDC-Base rail for on-chain payment execution
 *   - x402 JS client library (x402-js or Coinbase x402-sdk when available)
 *
 * Spec: https://x402.org | https://github.com/coinbase/x402
 *
 * Required env vars (real mode):
 *   BASE_NETWORK        — "mainnet" or "sepolia" (default: "sepolia")
 *   BASE_RPC_URL        — Base RPC endpoint
 *
 * For signing, inject a signAndSend function (see usdc-base.ts UsdcBaseSignAndSend).
 *
 * Docs:
 *   x402 spec: https://x402.org
 *   Coinbase x402: https://github.com/coinbase/x402
 */

import type { PaymentRequest, PaymentResult } from '../types.js'
import type { SpendEnvelope } from '../envelope.js'
import { getAgentPayConfig } from '../config.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface X402PaymentRequirements {
  /** Payment scheme: "exact" is the standard */
  scheme: string
  /** Network (e.g. "base-mainnet", "base-sepolia") */
  network: string
  /** Token contract address for payment */
  tokenAddress?: string
  /** Amount in token atomic units */
  amount?: string
  /** Recipient address */
  to: string
  /** Maximum age in seconds for a valid payment */
  maxTimeoutSeconds?: number
}

export interface X402Config {
  /** Custom HTTP client (defaults to global fetch) */
  fetchFn?: typeof fetch
  /** Timeout in ms for x402 requests (default: 30000) */
  timeoutMs?: number
}

// ---------------------------------------------------------------------------
// x402 payment header parsing
// ---------------------------------------------------------------------------

/**
 * Parse the X-Payment-Requirements header from a 402 response.
 * The header is a base64url-encoded JSON object.
 */
function parsePaymentRequirements(header: string): X402PaymentRequirements {
  try {
    const decoded = atob(header.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded) as X402PaymentRequirements
  } catch {
    // Try as plain JSON (some implementations skip base64)
    try {
      return JSON.parse(header) as X402PaymentRequirements
    } catch {
      throw new Error('x402: failed to parse X-Payment-Requirements header')
    }
  }
}

/**
 * Encode a payment receipt into the X-Payment header format.
 * The receipt is base64url-encoded JSON with the tx hash and timestamp.
 */
function encodePaymentHeader(txHash: string, amount: string, to: string): string {
  const receipt = {
    scheme: 'exact',
    txHash,
    amount,
    to,
    timestamp: Math.floor(Date.now() / 1000),
  }
  const json = JSON.stringify(receipt)
  const base64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return base64
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

function isMockMode(): boolean {
  return getAgentPayConfig().mockMode || readEnv('PQSAFE_MOCK_MODE') === '1'
}

// ---------------------------------------------------------------------------
// Public rail interface
// ---------------------------------------------------------------------------

/**
 * Execute an x402 payment for a given URL.
 *
 * This function:
 *   1. Fetches the URL to get the 402 + payment requirements
 *   2. Validates requirements against the envelope
 *   3. Executes the payment (mock or real)
 *   4. Re-fetches the URL with the X-Payment header
 *
 * In mock mode (PQSAFE_MOCK_MODE=1), simulates the full x402 handshake
 * without making real payments or fetching real URLs.
 */
export async function executePayment(
  envelope: SpendEnvelope,
  request: PaymentRequest,
  config?: X402Config,
): Promise<PaymentResult> {
  const mock = isMockMode()

  if (mock) {
    // Mock: simulate x402 handshake with realistic tx hash
    const mockTxHash = '0x' + Array.from(
      { length: 64 },
      () => Math.floor(Math.random() * 16).toString(16),
    ).join('')

    const mockTxId = `x402_sbx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    return {
      success: true,
      rail: 'x402',
      txId: mockTxId,
      amount: request.amount,
      currency: envelope.currency,
      recipient: request.recipient,
      executedAt: new Date().toISOString(),
      meta: {
        mock: true,
        protocol: 'x402',
        onChainTxHash: mockTxHash,
        endpoint: request.recipient,
        agent: envelope.agent,
        issuer: envelope.issuer,
        envelopeNonce: envelope.nonce,
        memo: request.memo ?? null,
      },
    }
  }

  // Real mode: full x402 handshake
  const fetchFn = config?.fetchFn ?? fetch
  const timeoutMs = config?.timeoutMs ?? 30_000

  // Step 1: Probe the endpoint for 402 + payment requirements
  const probeController = new AbortController()
  const probeTimer = setTimeout(() => probeController.abort(), timeoutMs)

  let requirements: X402PaymentRequirements

  try {
    const probeRes = await fetchFn(request.recipient, {
      method: 'GET',
      signal: probeController.signal,
    })

    if (probeRes.status !== 402) {
      throw new Error(
        `x402: endpoint ${request.recipient} did not return 402 (got ${probeRes.status})`,
      )
    }

    const reqHeader = probeRes.headers.get('X-Payment-Requirements') ??
      probeRes.headers.get('x-payment-requirements')
    if (!reqHeader) {
      throw new Error('x402: 402 response missing X-Payment-Requirements header')
    }

    requirements = parsePaymentRequirements(reqHeader)
  } finally {
    clearTimeout(probeTimer)
  }

  // Step 2: Validate requirements against envelope
  if (requirements.to && !envelope.allowedRecipients.includes(requirements.to)) {
    throw new Error(
      `PQSafe/x402: payment recipient ${requirements.to} is not in the envelope allowlist`,
    )
  }

  const requiredAmount = requirements.amount ? parseFloat(requirements.amount) / 1e6 : request.amount
  if (requiredAmount > envelope.maxAmount) {
    throw new Error(
      `PQSafe/x402: required payment ${requiredAmount} exceeds envelope maxAmount ${envelope.maxAmount}`,
    )
  }

  // Step 3: Execute payment (delegates to USDC-Base rail logic)
  // For now, throw with a clear message — full real-mode requires USDC-Base signer injection
  throw new Error(
    'PQSafe/x402: real-mode execution requires injecting a UsdcBaseSignAndSend function. ' +
    'Pass config.usdcBaseSigner to execute on-chain. Mock mode works without credentials: ' +
    'set PQSAFE_MOCK_MODE=1.',
  )
}

/**
 * Check if a URL endpoint supports x402 payments.
 * Returns the payment requirements if supported, null otherwise.
 */
export async function probeX402Endpoint(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<X402PaymentRequirements | null> {
  try {
    const res = await fetchFn(url, { method: 'GET' })
    if (res.status !== 402) return null

    const header = res.headers.get('X-Payment-Requirements') ??
      res.headers.get('x-payment-requirements')
    if (!header) return null

    return parsePaymentRequirements(header)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Named x402 protocol functions (per x402.org spec)
// ---------------------------------------------------------------------------

export interface X402ResourceResult {
  /** HTTP status of the response */
  status: number
  /** Payment requirements if 402 was returned, null otherwise */
  requirements: X402PaymentRequirements | null
  /** Response body text if resource was served (status 200) */
  body: string | null
}

export interface X402PaymentProof {
  /** On-chain tx hash or signed off-chain receipt */
  txHash: string
  /** Token amount in atomic units (e.g. USDC 6dp) */
  amount: string
  /** Recipient address from requirements */
  to: string
  /** Unix timestamp */
  timestamp: number
  /** X-Payment header value (base64url-encoded) */
  header: string
}

/**
 * Step 1: GET a URL and parse the 402 Payment Required response.
 * Returns the payment requirements needed to access the resource.
 */
export async function requestResource(
  url: string,
  config?: X402Config,
): Promise<X402ResourceResult> {
  const fetchFn = config?.fetchFn ?? fetch
  const timeoutMs = config?.timeoutMs ?? 30_000

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      signal: controller.signal,
    })

    if (res.status === 200) {
      const body = await res.text()
      return { status: 200, requirements: null, body }
    }

    if (res.status !== 402) {
      return { status: res.status, requirements: null, body: null }
    }

    const reqHeader = res.headers.get('X-Payment-Requirements') ??
      res.headers.get('x-payment-requirements')
    if (!reqHeader) {
      throw new Error('x402: 402 response missing X-Payment-Requirements header')
    }

    const requirements = parsePaymentRequirements(reqHeader)
    return { status: 402, requirements, body: null }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Step 2: Produce a payment proof for the given requirements.
 * In real mode this executes an on-chain USDC transfer.
 * Callers may inject a txHash from an already-executed on-chain transfer.
 */
export function signPayment(
  requirements: X402PaymentRequirements,
  txHashOrProof: string,
): X402PaymentProof {
  const amount = requirements.amount ?? '0'
  const to = requirements.to
  const timestamp = Math.floor(Date.now() / 1000)
  const header = encodePaymentHeader(txHashOrProof, amount, to)

  return {
    txHash: txHashOrProof,
    amount,
    to,
    timestamp,
    header,
  }
}

/**
 * Step 3: Re-GET the URL with the X-Payment header containing the proof.
 * Returns the resource body on success (HTTP 200).
 */
export async function retryWithPayment(
  url: string,
  proof: X402PaymentProof,
  config?: X402Config,
): Promise<{ status: number; body: string }> {
  const fetchFn = config?.fetchFn ?? fetch
  const timeoutMs = config?.timeoutMs ?? 30_000

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: {
        'X-Payment': proof.header,
        'X-Payment-TxHash': proof.txHash,
      },
      signal: controller.signal,
    })

    const body = await res.text()

    if (!res.ok && res.status !== 200) {
      throw new Error(`x402: payment rejected by server (${res.status}): ${body}`)
    }

    return { status: res.status, body }
  } finally {
    clearTimeout(timer)
  }
}
