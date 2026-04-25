/**
 * Stripe rail connector — card-based payments and SaaS billing.
 *
 * Stripe is the primary rail for agent payments to SaaS vendors:
 *   - Anthropic API credits (via invoice or subscription)
 *   - Vercel, GitHub, AWS, Cloudflare — most SaaS accept Stripe payment links
 *   - Invoice payment (pay a Stripe invoice ID directly)
 *
 * Two sub-modes:
 *   1. **Invoice payment** (recipient is a Stripe Invoice ID: `in_xxx`)
 *      → POST /v1/invoices/{id}/pay
 *   2. **PaymentIntent** (recipient is a Stripe customer/price/amount)
 *      → POST /v1/payment_intents + confirm
 *   3. **Payment Link** (recipient is a payment_link URL or `plink_xxx`)
 *      → Return the link for human completion (semi-autonomous)
 *
 * Flow (invoice payment):
 *   1. Detect recipient format (invoice ID, customer ID, or payment link)
 *   2. Retrieve invoice to verify amount matches envelope
 *   3. POST /v1/invoices/{id}/pay
 *   4. Map Stripe response → PaymentResult
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY    — Stripe secret key (sk_test_... or sk_live_...)
 *   STRIPE_ENV           — "test" (default) or "live"
 *
 * Docs: https://stripe.com/docs/api
 */

import type { PaymentRequest, PaymentResult } from '../types.js'
import type { SpendEnvelope } from '../envelope.js'
import { getAgentPayConfig } from '../config.js'

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function readEnv(key: string): string | null {
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key] as string
  }
  return null
}

function getStripeConfig() {
  const secretKey = readEnv('STRIPE_SECRET_KEY')
  const env = readEnv('STRIPE_ENV') === 'live' ? 'live' : 'test'
  const cfg = getAgentPayConfig()
  const mockMode = cfg.mockMode || readEnv('PQSAFE_MOCK_MODE') === '1' || !secretKey
  return { secretKey, env, mockMode }
}

// ---------------------------------------------------------------------------
// Stripe API helpers
// ---------------------------------------------------------------------------

async function stripeRequest(
  secretKey: string,
  method: 'GET' | 'POST',
  path: string,
  formData?: Record<string, string | number>,
): Promise<Record<string, unknown>> {
  const body = formData
    ? new URLSearchParams(
        Object.entries(formData).map(([k, v]) => [k, String(v)])
      ).toString()
    : undefined

  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    },
    body,
  })

  const data = await res.json() as Record<string, unknown>

  if (!res.ok) {
    const error = (data as { error?: { message?: string; code?: string } }).error
    const msg = error?.message ?? JSON.stringify(data)
    const code = error?.code ?? ''

    if (code === 'card_declined' || msg.includes('declined')) {
      throw new Error('PQSafe/Stripe: CARD_DECLINED')
    }
    if (msg.includes('invoice') && msg.includes('paid')) {
      throw new Error('PQSafe/Stripe: INVOICE_ALREADY_PAID')
    }
    if (msg.includes('insufficient')) {
      throw new Error('PQSafe/Stripe: INSUFFICIENT_FUNDS')
    }
    throw new Error(`Stripe API error (${res.status}): ${msg}`)
  }

  return data
}

// ---------------------------------------------------------------------------
// Recipient detection
// ---------------------------------------------------------------------------

type StripeRecipientType = 'invoice' | 'payment_intent' | 'payment_link' | 'customer' | 'unknown'

function detectRecipientType(recipient: string): StripeRecipientType {
  if (recipient.startsWith('in_')) return 'invoice'
  if (recipient.startsWith('pi_')) return 'payment_intent'
  if (recipient.startsWith('plink_')) return 'payment_link'
  if (recipient.startsWith('cus_')) return 'customer'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Public rail interface
// ---------------------------------------------------------------------------

export async function executePayment(
  envelope: SpendEnvelope,
  request: PaymentRequest,
): Promise<PaymentResult> {
  const { secretKey, env, mockMode } = getStripeConfig()
  const recipientType = detectRecipientType(request.recipient)

  // -------------------------------------------------------------------------
  // Mock path
  // -------------------------------------------------------------------------
  if (mockMode) {
    const mockTxId = `pi_sbx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    return {
      success: true,
      rail: 'stripe',
      txId: mockTxId,
      amount: request.amount,
      currency: envelope.currency,
      recipient: request.recipient,
      executedAt: new Date().toISOString(),
      meta: {
        mock: true,
        env,
        recipientType,
        agent: envelope.agent,
        issuer: envelope.issuer,
        envelopeNonce: envelope.nonce,
        memo: request.memo ?? null,
      },
    }
  }

  // -------------------------------------------------------------------------
  // Real path — route by recipient type
  // -------------------------------------------------------------------------
  if (recipientType === 'invoice') {
    return payInvoice(secretKey!, request, envelope, env)
  }

  if (recipientType === 'payment_intent') {
    return confirmPaymentIntent(secretKey!, request, envelope, env)
  }

  if (recipientType === 'payment_link') {
    // Payment links require human browser interaction
    // Return a "pending" result with the link URL for the agent to surface
    return {
      success: false,
      rail: 'stripe',
      txId: `plink_pending_${Date.now()}`,
      amount: request.amount,
      currency: envelope.currency,
      recipient: request.recipient,
      executedAt: new Date().toISOString(),
      meta: {
        mock: false,
        env,
        recipientType: 'payment_link',
        requiresHuman: true,
        paymentLinkUrl: `https://buy.stripe.com/${request.recipient.replace('plink_', '')}`,
        note: 'Payment link requires human browser interaction. Share this URL with the user.',
        agent: envelope.agent,
        envelopeNonce: envelope.nonce,
      },
    }
  }

  throw new Error(
    `PQSafe/Stripe: unsupported recipient format "${request.recipient}". ` +
    `Supported: Stripe invoice ID (in_xxx), payment intent (pi_xxx), payment link (plink_xxx).`,
  )
}

// ---------------------------------------------------------------------------
// Invoice payment
// ---------------------------------------------------------------------------

async function payInvoice(
  secretKey: string,
  request: PaymentRequest,
  envelope: SpendEnvelope,
  env: string,
): Promise<PaymentResult> {
  const invoiceId = request.recipient

  // Fetch invoice to verify amount
  const invoice = await stripeRequest(secretKey, 'GET', `/v1/invoices/${invoiceId}`)
  const invoiceAmountDue = ((invoice.amount_due as number) ?? 0) / 100 // Stripe uses cents

  if (invoiceAmountDue > envelope.maxAmount) {
    throw new Error(
      `PQSafe/Stripe: invoice amount ${invoiceAmountDue} ${invoice.currency as string} ` +
      `exceeds envelope maxAmount ${envelope.maxAmount} ${envelope.currency}`,
    )
  }

  // Pay the invoice
  const payment = await stripeRequest(
    secretKey,
    'POST',
    `/v1/invoices/${invoiceId}/pay`,
    {
      payment_method: 'pm_card_visa', // sandbox: use default test card
    },
  )

  const paymentIntent = payment.payment_intent as string | undefined
  const status = payment.status as string

  return {
    success: status === 'paid',
    rail: 'stripe',
    txId: paymentIntent ?? invoiceId,
    amount: invoiceAmountDue,
    currency: (invoice.currency as string ?? envelope.currency).toUpperCase(),
    recipient: invoiceId,
    executedAt: new Date().toISOString(),
    meta: {
      mock: false,
      env,
      recipientType: 'invoice',
      stripeInvoiceId: invoiceId,
      stripeStatus: status,
      agent: envelope.agent,
      issuer: envelope.issuer,
      envelopeNonce: envelope.nonce,
      memo: request.memo ?? null,
    },
  }
}

// ---------------------------------------------------------------------------
// Payment intent confirmation
// ---------------------------------------------------------------------------

async function confirmPaymentIntent(
  secretKey: string,
  request: PaymentRequest,
  envelope: SpendEnvelope,
  env: string,
): Promise<PaymentResult> {
  const piId = request.recipient

  // Confirm the payment intent
  const pi = await stripeRequest(
    secretKey,
    'POST',
    `/v1/payment_intents/${piId}/confirm`,
    {
      payment_method: 'pm_card_visa', // sandbox: use default test card
    },
  )

  const status = pi.status as string
  const amountReceived = ((pi.amount_received as number) ?? (pi.amount as number) ?? 0) / 100

  return {
    success: status === 'succeeded',
    rail: 'stripe',
    txId: piId,
    amount: amountReceived || request.amount,
    currency: (pi.currency as string ?? envelope.currency).toUpperCase(),
    recipient: piId,
    executedAt: new Date().toISOString(),
    meta: {
      mock: false,
      env,
      recipientType: 'payment_intent',
      stripeStatus: status,
      agent: envelope.agent,
      issuer: envelope.issuer,
      envelopeNonce: envelope.nonce,
      memo: request.memo ?? null,
    },
  }
}
