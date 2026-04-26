/**
 * @pqsafe/mastra — PQSafe AgentPay integration for Mastra workflows.
 *
 * > **Experimental** — Mastra's Tool interface is evolving. This integration
 * > tracks Mastra core `>=0.1.0`. Pin to a specific version in production.
 *
 * Provides:
 *   - `createPQSafeTool()` — Mastra Tool object with `execute()` handler
 *   - `createPQSafeIntegration()` — lightweight integration object for direct use
 *     inside workflow steps (no Mastra dependency required at runtime)
 *
 * Built on `@pqsafe/agent-pay` — see github.com/PQSafe/pqsafe
 */

import {
  executeAgentPayment,
  type SignedEnvelope,
  type PaymentRequest,
  type PaymentResult,
  type RailConfig,
} from '@pqsafe/agent-pay'

export type { SignedEnvelope, PaymentRequest, PaymentResult, RailConfig }

// ---------------------------------------------------------------------------
// Mastra Tool interface (minimal — avoids hard runtime dep on @mastra/core)
// This mirrors Mastra's Tool<TInput, TOutput> type.
// ---------------------------------------------------------------------------

/** Input schema for the PQSafe payment tool */
export interface PQSafeToolInput {
  /** Serialized SignedEnvelope JSON string */
  envelopeJson: string
  /** ML-DSA-65 signature, hex-encoded */
  signature: string
  /** Issuer ML-DSA-65 public key, hex-encoded */
  dsaPublicKey: string
  /** Recipient address (rail-specific) */
  recipient: string
  /** Amount to pay in envelope's currency */
  amount: number
  /** Optional memo / reference */
  memo?: string
  /**
   * Mock mode — return synthetic result without calling a real rail.
   * @default false
   */
  mockMode?: boolean
}

/** Output returned by the PQSafe payment tool */
export interface PQSafeToolOutput {
  success: boolean
  txId: string
  rail: string
  amount: number
  currency: string
  recipient: string
  executedAt: string
  mockMode?: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Mastra Tool definition
// ---------------------------------------------------------------------------

/**
 * Mastra-compatible Tool object for PQSafe AgentPay.
 *
 * Compatible with Mastra's `createTool()` or direct use in workflow steps.
 *
 * @example
 * ```ts
 * import { createTool } from '@mastra/core'
 * import { pqsafeToolConfig } from '@pqsafe/mastra'
 *
 * const pqsafeTool = createTool(pqsafeToolConfig)
 * ```
 */
export const pqsafeToolConfig = {
  id: 'pqsafe_pay',
  description:
    'Execute a post-quantum-authorized payment using PQSafe AgentPay. ' +
    'Verifies ML-DSA-65 signature, enforces recipient allowlist and amount ceiling, ' +
    'then routes the payment to the configured rail (Airwallex, Stripe, Wise, USDC-Base, x402). ' +
    'Set mockMode=true for testing without real credentials.',

  inputSchema: {
    type: 'object' as const,
    properties: {
      envelopeJson: {
        type: 'string',
        description: 'Canonical envelope JSON string from signEnvelope().',
      },
      signature: {
        type: 'string',
        description: 'ML-DSA-65 signature, hex-encoded.',
      },
      dsaPublicKey: {
        type: 'string',
        description: "Issuer's ML-DSA-65 public key, hex-encoded.",
      },
      recipient: {
        type: 'string',
        description: 'Recipient address (must be in envelope allowedRecipients).',
      },
      amount: {
        type: 'number',
        description: 'Amount to pay (must be <= envelope maxAmount).',
      },
      memo: {
        type: 'string',
        description: 'Optional human-readable memo.',
      },
      mockMode: {
        type: 'boolean',
        description: 'Return synthetic result without calling a real rail.',
      },
    },
    required: ['envelopeJson', 'signature', 'dsaPublicKey', 'recipient', 'amount'],
  } as const,

  /**
   * Execute the payment.
   * Call this directly in Mastra workflow steps, or pass to createTool().
   */
  async execute(input: PQSafeToolInput): Promise<PQSafeToolOutput> {
    const signed: SignedEnvelope = {
      envelopeJson: input.envelopeJson,
      signature: input.signature,
      dsaPublicKey: input.dsaPublicKey,
    }

    const request: PaymentRequest = {
      recipient: input.recipient,
      amount: input.amount,
      ...(input.memo ? { memo: input.memo } : {}),
    }

    if (input.mockMode) {
      // Parse currency from envelope for mock result
      let currency = 'USD'
      try {
        const env = JSON.parse(input.envelopeJson) as { currency?: string }
        if (typeof env.currency === 'string') currency = env.currency
      } catch {
        // use default
      }

      return {
        success: true,
        txId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        rail: 'airwallex',
        amount: input.amount,
        currency,
        recipient: input.recipient,
        executedAt: new Date().toISOString(),
        mockMode: true,
      }
    }

    try {
      const result: PaymentResult = await executeAgentPayment(signed, request)
      return {
        success: result.success,
        txId: result.txId,
        rail: result.rail,
        amount: result.amount,
        currency: result.currency,
        recipient: result.recipient,
        executedAt: result.executedAt,
      }
    } catch (err) {
      return {
        success: false,
        txId: '',
        rail: '',
        amount: input.amount,
        currency: '',
        recipient: input.recipient,
        executedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Integration factory (framework-agnostic helper for workflow steps)
// ---------------------------------------------------------------------------

export interface PQSafeIntegrationConfig {
  /** Override the default Airwallex/Stripe/etc. rail config */
  rail?: RailConfig
  /** Mock mode — bypass rails for testing */
  mockMode?: boolean
}

export interface PQSafeIntegration {
  pay(signed: SignedEnvelope, request: PaymentRequest): Promise<PQSafeToolOutput>
}

/**
 * Create a PQSafe integration object for direct use in Mastra workflow steps.
 *
 * Does NOT require @mastra/core at runtime — works in any async step.
 *
 * @example
 * ```ts
 * import { createPQSafeIntegration } from '@pqsafe/mastra'
 *
 * const pqsafe = createPQSafeIntegration({ mockMode: true })
 *
 * // Inside a Mastra workflow step:
 * const result = await pqsafe.pay(context.signedEnvelope, {
 *   recipient: context.recipient,
 *   amount: context.amount,
 *   memo: context.memo,
 * })
 * ```
 */
export function createPQSafeIntegration(
  config: PQSafeIntegrationConfig = {},
): PQSafeIntegration {
  return {
    async pay(
      signed: SignedEnvelope,
      request: PaymentRequest,
    ): Promise<PQSafeToolOutput> {
      return pqsafeToolConfig.execute({
        envelopeJson: signed.envelopeJson,
        signature: signed.signature,
        dsaPublicKey: signed.dsaPublicKey,
        recipient: request.recipient,
        amount: request.amount,
        memo: request.memo,
        mockMode: config.mockMode,
      })
    },
  }
}
