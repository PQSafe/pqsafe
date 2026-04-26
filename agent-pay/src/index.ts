/**
 * @pqsafe/agent-pay — public API
 *
 * Primary entry point for AI agents to execute PQ-authorized payments.
 *
 * Usage:
 *   import { executeAgentPayment } from '@pqsafe/agent-pay'
 *
 *   const result = await executeAgentPayment(signedEnvelope, {
 *     recipient: 'anthropic.com/billing',
 *     amount: 50,
 *     memo: 'SeniorDeli supplier invoice #42',
 *   })
 */

import { verifyEnvelope } from './envelope.js'
import type { SpendEnvelope as _SpendEnvelope } from './envelope.js'
import { routePayment } from './rails/index.js'
import type { RailConfig } from './rails/index.js'
import type { SignedEnvelope, PaymentRequest, PaymentResult } from './types.js'
import { autoSubmitToLedger } from './ledger.js'
import { requestApproval as _requestApproval } from './approval.js'
import type { ApprovalRequest as _ApprovalRequest } from './approval.js'

export type { RailConfig } from './rails/index.js'
export { probeX402Endpoint } from './rails/x402.js'
export type { X402Config, X402PaymentRequirements } from './rails/x402.js'
export { submitToLedger, buildLedgerRecord } from './ledger.js'
export type { LedgerRecord } from './ledger.js'

export * from './envelope.js'
export * from './types.js'
export * from './canonical.js'
export * from './adapters/index.js'

// Convenience re-exports: protocol namespace types at the top-level public API.
// Consumers can import `AP2` or `StripeACP` directly from '@pqsafe/agent-pay'
// without knowing the adapters/ sub-path.
export type { AP2 } from './adapters/ap2.js'
export type { Stripe as StripeACP } from './adapters/acp.js'
export { getAgentPayConfig, setAgentPayConfig } from './config.js'
export {
  commitEnvelopeToArbitrum,
  isEnvelopeCommitted,
  computeEnvelopeId,
  extractSigFingerprint,
  SPEND_ENVELOPE_REGISTRY_ABI,
} from './arbitrum.js'
export type { ArbitrumCommitConfig, CommitResult, EthTxParams } from './arbitrum.js'
export { executeWithApproval, getTelegramChatId, requestApproval, getApprovalStatus, resolveApproval } from './approval.js'
export type {
  ApprovalConfig,
  ApprovalInfo,
  ApprovalChannel,
  ApprovalRequest,
  ApprovalResult,
  ApprovalAuditEntry,
  TelegramConfig,
  SlackConfig,
  EmailConfig,
  WebhookConfig,
  DiscordConfig,
  SmsConfig,
  WhatsappConfig,
} from './approval.js'
export { ApprovalRejectedError, ApprovalTimeoutError } from './approval.js'
export {
  encodeTransferCalldata,
  toUsdcAtomicUnits,
} from './rails/usdc-base.js'
export type { UsdcBaseConfig, UsdcBaseSignAndSend, UsdcBaseTxParams, BaseNetwork } from './rails/usdc-base.js'

// ---------------------------------------------------------------------------
// Sprint 2 scaffold — types, stubs, and PQSafeError hierarchy
// ---------------------------------------------------------------------------
export * from './sprint2/index.js'

// ---------------------------------------------------------------------------
// Core public function
// ---------------------------------------------------------------------------

/**
 * Verify a PQ-signed SpendEnvelope and execute the payment if all checks pass.
 *
 * Checks performed (in order):
 *   1. ML-DSA-65 signature verification
 *   2. Zod schema validation
 *   3. Temporal validity (validFrom / validUntil)
 *   4. Recipient allowlist check
 *   5. Amount ceiling check (request.amount <= envelope.maxAmount)
 *   5b. Human approval gate (if approvalRequest provided, or amount >= requiresApprovalAbove)
 *   6. Route to rail connector
 *
 * @param approvalRequest - Optional approval gate config. If omitted and amount is below any
 *   configured threshold, the payment executes immediately. If provided, the payment is blocked
 *   until a human approves via the configured channels.
 * @throws {ApprovalRejectedError} if approval is rejected
 * @throws {ApprovalTimeoutError} if approval times out
 * @throws if any other check fails — payments are only attempted if ALL checks pass.
 */
export async function executeAgentPayment(
  signed: SignedEnvelope,
  request: PaymentRequest,
  railConfig?: RailConfig,
  approvalRequest?: _ApprovalRequest,
): Promise<PaymentResult> {
  // Step 1-3: Verify signature + schema + temporal validity
  const envelope = verifyEnvelope(signed)

  // Step 4: Recipient allowlist
  if (!envelope.allowedRecipients.includes(request.recipient)) {
    throw new Error(
      `PQSafe: recipient "${request.recipient}" is not in the envelope allowlist. ` +
      `Allowed: [${envelope.allowedRecipients.join(', ')}]`,
    )
  }

  // Step 5: Amount ceiling
  if (request.amount <= 0) {
    throw new Error(`PQSafe: payment amount must be positive (got ${request.amount})`)
  }
  if (request.amount > envelope.maxAmount) {
    throw new Error(
      `PQSafe: requested amount ${request.amount} ${envelope.currency} exceeds ` +
      `envelope maxAmount ${envelope.maxAmount} ${envelope.currency}`,
    )
  }

  // Step 5b: Human approval gate
  // Triggered if: (a) explicit approvalRequest provided, OR
  //               (b) envelope has requiresApprovalAbove and amount exceeds it
  const requiresApproval = approvalRequest != null ||
    ((envelope as unknown as { requiresApprovalAbove?: number }).requiresApprovalAbove != null &&
      request.amount >= ((envelope as unknown as { requiresApprovalAbove?: number }).requiresApprovalAbove ?? Infinity))

  if (requiresApproval && approvalRequest) {
    await _requestApproval({
      ...approvalRequest,
      envelope: signed,
      paymentRequest: request,
    })
  }

  // Step 6: Route to rail
  const result = await routePayment(envelope, request, railConfig)

  // Step 7: Fire-and-forget ledger submission (anonymized, opt-in via PQSAFE_LEDGER_URL)
  autoSubmitToLedger(signed, envelope, result)

  return result
}
