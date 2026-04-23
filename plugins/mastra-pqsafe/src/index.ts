/**
 * @pqsafe/mastra — PQSafe AgentPay integration for Mastra workflows.
 *
 * Built on `@pqsafe/agent-pay` — see github.com/PQSafe/pqsafe
 *
 * Usage:
 *   import { createPQSafeIntegration } from '@pqsafe/mastra'
 *   const pqsafe = createPQSafeIntegration({ apiUrl: 'https://api.pqsafe.xyz/v1' })
 *   const result = await pqsafe.pay(signedEnvelope, { recipient, amount, memo })
 */

// ---------------------------------------------------------------------------
// Types (mirrors @pqsafe/agent-pay types — avoids hard runtime dep for stub)
// ---------------------------------------------------------------------------

/** A PQ-signed envelope authorizing agent spend */
export interface SignedEnvelope {
  /** Canonical deterministic JSON of the SpendEnvelope */
  envelopeJson: string
  /** ML-DSA-65 signature over envelopeJson bytes, hex-encoded */
  signature: string
  /** ML-DSA-65 public key of the issuer, hex-encoded */
  dsaPublicKey: string
}

/** A payment request submitted to PQSafe */
export interface PaymentRequest {
  /** Recipient address — rail-specific (IBAN, crypto addr, Stripe customer, etc.) */
  recipient: string
  /** Amount to pay in the envelope's declared currency */
  amount: number
  /** Optional human-readable memo / reference */
  memo?: string
}

/** Returned by pqsafe.pay() on success */
export interface PaymentResult {
  /** Rail-specific transaction ID */
  txId: string
  /** Settlement status (e.g. "pending", "settled") */
  status: string
  /** Payment rail used (airwallex | wise | stripe | usdc-base | x402) */
  rail: string
}

// ---------------------------------------------------------------------------
// Integration config
// ---------------------------------------------------------------------------

export interface PQSafeIntegrationConfig {
  /**
   * Base URL of the PQSafe REST API.
   * @default "https://api.pqsafe.xyz/v1"
   */
  apiUrl?: string

  /**
   * Optional fetch timeout in milliseconds.
   * @default 30000
   */
  timeoutMs?: number
}

// ---------------------------------------------------------------------------
// Core integration object
// ---------------------------------------------------------------------------

export interface PQSafeIntegration {
  /**
   * Execute a PQ-authorized payment.
   *
   * @param signed - A SignedEnvelope issued by the wallet owner
   * @param request - Recipient, amount, and optional memo
   * @returns PaymentResult with txId, status, and rail
   * @throws Error if the HTTP call fails or the server rejects the envelope
   */
  pay(signed: SignedEnvelope, request: PaymentRequest): Promise<PaymentResult>
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a PQSafe integration object for use inside Mastra workflows.
 *
 * @example
 * ```ts
 * const pqsafe = createPQSafeIntegration()
 *
 * const workflow = new Workflow({ name: 'pay-supplier' })
 *   .step('pay', async ({ context }) => {
 *     const result = await pqsafe.pay(context.signedEnvelope, {
 *       recipient: context.recipient,
 *       amount: context.amount,
 *       memo: context.memo,
 *     })
 *     return result
 *   })
 * ```
 */
export function createPQSafeIntegration(
  config: PQSafeIntegrationConfig = {},
): PQSafeIntegration {
  const apiUrl = (config.apiUrl ?? 'https://api.pqsafe.xyz/v1').replace(/\/$/, '')
  const timeoutMs = config.timeoutMs ?? 30_000

  async function pay(
    signed: SignedEnvelope,
    request: PaymentRequest,
  ): Promise<PaymentResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      response = await fetch(`${apiUrl}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedEnvelope: signed, request }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '(no body)')
      throw new Error(
        `PQSafe: payment request failed — HTTP ${response.status}: ${body}`,
      )
    }

    const data = (await response.json()) as Record<string, unknown>
    return {
      txId: String(data['txId'] ?? ''),
      status: String(data['status'] ?? 'unknown'),
      rail: String(data['rail'] ?? 'unknown'),
    }
  }

  return { pay }
}
