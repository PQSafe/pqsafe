/**
 * PQSafePaymentTool — LangChain Tool wrapper for PQSafe AgentPay.
 *
 * Extends the LangChain `Tool` (StructuredTool) base class so any LangChain
 * agent can execute post-quantum-authorized payments in a single tool call.
 *
 * The tool verifies the PQ signature, enforces the envelope constraints
 * (recipient allowlist, amount ceiling, temporal validity), and routes
 * the payment to the correct rail — all locally, without a remote API.
 *
 * Built on `@pqsafe/agent-pay` — see github.com/PQSafe/pqsafe
 */

import { Tool } from '@langchain/core/tools'
import {
  type SignedEnvelope,
  type PaymentRequest,
  type PaymentResult,
  type RailConfig,
  executeAgentPayment,
  createEnvelope,
  signEnvelope,
  verifyEnvelope,
} from '@pqsafe/agent-pay'

export type { SignedEnvelope, PaymentRequest, PaymentResult, RailConfig }

// ---------------------------------------------------------------------------
// Re-export core SDK helpers so consumers need only this package
// ---------------------------------------------------------------------------
export { createEnvelope, signEnvelope, verifyEnvelope }

// ---------------------------------------------------------------------------
// Tool options
// ---------------------------------------------------------------------------

export interface PQSafePaymentToolOptions {
  /**
   * Pre-signed SpendEnvelope to use for every call.
   * The agent passes this directly; the tool does not store credentials.
   */
  envelope: SignedEnvelope

  /**
   * Optional payment rail config (Airwallex, Wise, Stripe, USDC-Base, x402).
   * Omit to let the router choose based on the envelope's `rail` field.
   */
  rail?: RailConfig

  /**
   * Mock mode — return a fake successful result without hitting any rail.
   * Useful for unit tests and CI pipelines.
   * @default false
   */
  mockMode?: boolean
}

// ---------------------------------------------------------------------------
// Mock handler
// ---------------------------------------------------------------------------

function mockResult(
  request: PaymentRequest,
  envelope: SignedEnvelope,
): PaymentResult {
  // Parse envelope JSON to get currency
  let currency = 'USD'
  try {
    const parsed = JSON.parse(envelope.envelopeJson) as { currency?: string }
    if (typeof parsed.currency === 'string') currency = parsed.currency
  } catch {
    // ignore parse failure — use default
  }

  return {
    success: true,
    rail: 'airwallex',
    txId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    amount: request.amount,
    currency,
    recipient: request.recipient,
    executedAt: new Date().toISOString(),
    meta: { mockMode: true },
  }
}

// ---------------------------------------------------------------------------
// PQSafePaymentTool
// ---------------------------------------------------------------------------

/**
 * LangChain Tool that executes a PQ-authorized payment via PQSafe AgentPay.
 *
 * Input format (JSON string):
 * ```json
 * {
 *   "amount": 49.99,
 *   "currency": "USD",
 *   "recipient": "anthropic.com/billing",
 *   "memo": "Claude API credits — April 2026"
 * }
 * ```
 *
 * Returns a human-readable string with `txId`, `rail`, `amount`, `currency`.
 *
 * Usage:
 * ```ts
 * import { PQSafePaymentTool } from '@pqsafe/agent-pay-langchain'
 *
 * const tool = new PQSafePaymentTool({ envelope: signedEnvelope })
 * const agent = createReactAgent({ llm, tools: [tool] })
 * ```
 */
export class PQSafePaymentTool extends Tool {
  override name = 'pqsafe_pay'

  override description =
    'Execute a post-quantum-authorized payment using PQSafe AgentPay. ' +
    'Input must be a JSON string with fields: amount (number), currency (string), ' +
    'recipient (string), and optional memo (string). ' +
    'Only pays recipients pre-approved in the envelope. ' +
    'Returns: txId, rail, amount, currency, and executedAt timestamp.'

  private readonly opts: PQSafePaymentToolOptions

  constructor(opts: PQSafePaymentToolOptions) {
    super()
    this.opts = opts
  }

  /**
   * Execute the payment.
   *
   * @param input JSON string with { amount, currency, recipient, memo? }
   * @returns Human-readable result string or error description.
   */
  override async _call(input: string): Promise<string> {
    // Parse input
    let parsed: { amount?: unknown; currency?: unknown; recipient?: unknown; memo?: unknown }
    try {
      parsed = JSON.parse(input) as typeof parsed
    } catch {
      return `Error: input is not valid JSON. Expected: {"amount": <number>, "currency": "<ISO code>", "recipient": "<address>", "memo": "<optional string>"}`
    }

    const amount = Number(parsed.amount)
    const currency = String(parsed.currency ?? '')
    const recipient = String(parsed.recipient ?? '')
    const memo = parsed.memo != null ? String(parsed.memo) : undefined

    if (!Number.isFinite(amount) || amount <= 0) {
      return `Error: "amount" must be a positive number (got ${String(parsed.amount)})`
    }
    if (!recipient) {
      return `Error: "recipient" is required`
    }

    // Validate currency matches envelope (informational, not blocking — SDK enforces)
    if (currency) {
      let envelopeCurrency = ''
      try {
        const env = JSON.parse(this.opts.envelope.envelopeJson) as { currency?: string }
        envelopeCurrency = env.currency ?? ''
      } catch {
        // ignore — SDK will verify
      }
      if (envelopeCurrency && currency.toUpperCase() !== envelopeCurrency.toUpperCase()) {
        return (
          `Error: currency mismatch — envelope authorizes ${envelopeCurrency}, ` +
          `but input requests ${currency.toUpperCase()}`
        )
      }
    }

    const request: PaymentRequest = { recipient, amount, ...(memo ? { memo } : {}) }

    // Mock mode — bypass SDK and return synthetic result
    if (this.opts.mockMode) {
      const result = mockResult(request, this.opts.envelope)
      return (
        `Payment successful (mock). ` +
        `txId=${result.txId} rail=${result.rail} ` +
        `amount=${result.amount} ${result.currency} ` +
        `recipient=${result.recipient} executedAt=${result.executedAt}`
      )
    }

    // Live mode — call SDK
    let result: PaymentResult
    try {
      result = await executeAgentPayment(this.opts.envelope, request, this.opts.rail)
    } catch (err) {
      return `Payment failed: ${err instanceof Error ? err.message : String(err)}`
    }

    return (
      `Payment successful. ` +
      `txId=${result.txId} rail=${result.rail} ` +
      `amount=${result.amount} ${result.currency} ` +
      `recipient=${result.recipient} executedAt=${result.executedAt}`
    )
  }
}
