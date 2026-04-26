/**
 * PQSafe AgentPay — payment protocol adapter barrel.
 *
 * Exports adapters for converting between PQSafe SpendEnvelopes and the
 * mandates / tokens used by external agentic payment protocols:
 *
 *   - AP2: Google Agentic Payments Protocol (v0.3.0)
 *   - Stripe ACP: Stripe Agent Commerce Protocol / Shared Payment Tokens
 *
 * All production implementation is queued for Sprint 2 (May 19 → Jun 8, 2026).
 * Current exports are stubs with full TypeScript type contracts.
 *
 * @module adapters
 */

export * from './ap2.js'
export * from './acp.js'

export type { AP2 } from './ap2.js'
export type { Stripe as StripeACP } from './acp.js'
