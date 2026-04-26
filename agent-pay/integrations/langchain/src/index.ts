/**
 * @pqsafe/agent-pay-langchain
 *
 * LangChain integration for PQSafe AgentPay — post-quantum safe payments for AI agents.
 *
 * @example
 * ```ts
 * import { PQSafePaymentTool } from '@pqsafe/agent-pay-langchain'
 * import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
 * import { createEnvelope, signEnvelope } from '@pqsafe/agent-pay'
 *
 * const { publicKey, secretKey } = ml_dsa65.keygen()
 * const envelope = createEnvelope({ issuer: 'pq1...', agent: 'my-agent', ... })
 * const signed = signEnvelope(envelope, secretKey, publicKey)
 *
 * const tool = new PQSafePaymentTool({ envelope: signed, mockMode: true })
 * ```
 */

export { PQSafePaymentTool } from './PQSafePaymentTool.js'
export type {
  PQSafePaymentToolOptions,
  SignedEnvelope,
  PaymentRequest,
  PaymentResult,
  RailConfig,
} from './PQSafePaymentTool.js'
export { createEnvelope, signEnvelope, verifyEnvelope } from './PQSafePaymentTool.js'
