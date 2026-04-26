/**
 * Rail router — selects the correct connector based on envelope.rail
 * and executes the payment.
 *
 * Rail selection priority:
 *   1. If envelope.rail is set → use that rail exclusively.
 *   2. Otherwise → auto-route via selectRail() based on recipient/currency/amount.
 *
 * RailAdapter interface:
 *   Each rail exposes a unified adapter with execute(), supports(), estimateLatency(),
 *   and estimateCost() — enabling cost/latency-aware routing decisions.
 *
 * Adding a new rail:
 *   1. Add the rail name to the Rail type in types.ts
 *   2. Add the rail name to RailSchema in envelope.ts
 *   3. Create src/rails/<rail>.ts implementing executePayment()
 *   4. Add the RailAdapter implementation below
 */

import type { PaymentRequest, PaymentResult, Rail } from '../types.js'
import type { SpendEnvelope } from '../envelope.js'
import type { UsdcBaseConfig } from './usdc-base.js'
import { executePayment as airwallexPay } from './airwallex.js'
import { executePayment as wisePay } from './wise.js'
import { executePayment as usdcBasePay } from './usdc-base.js'
import { executePayment as x402Pay } from './x402.js'
import { executePayment as stripePay } from './stripe.js'

// ---------------------------------------------------------------------------
// Public exports — RailAdapter interface
// ---------------------------------------------------------------------------

export type { Rail }

/**
 * A unified rail adapter that wraps each rail connector.
 * Allows the router to introspect capabilities before committing to a rail.
 */
export interface RailAdapter {
  /** Rail identifier */
  name: Rail
  /** Execute a payment through this rail */
  execute(envelope: SpendEnvelope, params: PaymentRequest): Promise<PaymentResult>
  /**
   * Returns true if this rail can handle the given currency and recipient format.
   * Used by selectRail() to find candidate adapters.
   */
  supports(currency: string, recipient: string): boolean
  /**
   * Estimated end-to-end latency in seconds (P50).
   * Used by selectRail() for latency-optimized routing.
   */
  estimateLatency(): number
  /**
   * Estimated rail fee for the given amount.
   * Returns { rail_fee, currency } — does NOT include bank/network fees.
   */
  estimateCost(amount: number, currency: string): { rail_fee: number; currency: string }
}

// ---------------------------------------------------------------------------
// Recipient format detectors
// ---------------------------------------------------------------------------

/** IBAN: 2-letter country + 2 digits + up to 30 alphanum, optional spaces */
function isIban(recipient: string): boolean {
  return /^[A-Z]{2}\d{2}[A-Z0-9 ]{4,30}$/.test(recipient.replace(/\s/g, '').toUpperCase())
}

/** UK sort code + account number: "60-00-01 12345678" */
function isUkSortCode(recipient: string): boolean {
  return /^\d{2}[-]?\d{2}[-]?\d{2}[/ ]\d{8}$/.test(recipient)
}

/** US ABA: "021000021/000123456789" */
function isUsAba(recipient: string): boolean {
  return /^\d{9}[/ ]\d{6,17}$/.test(recipient)
}

/** EVM / Ethereum address: 0x + 40 hex chars */
function isEvmAddress(recipient: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(recipient)
}

/** URL: http(s):// endpoint — x402 or Stripe payment link */
function isUrl(recipient: string): boolean {
  return /^https?:\/\//i.test(recipient)
}

/** Stripe IDs: in_, pi_, plink_, cus_ */
function isStripeId(recipient: string): boolean {
  return /^(in_|pi_|plink_|cus_)/.test(recipient)
}

// ---------------------------------------------------------------------------
// Rail adapter implementations
// ---------------------------------------------------------------------------

/** Per-rail configuration passed through from executeAgentPayment */
export interface RailConfig {
  usdcBase?: UsdcBaseConfig
}

const airwallexAdapter: RailAdapter = {
  name: 'airwallex',
  execute: (envelope, params) => airwallexPay(envelope, params),
  supports(currency: string, recipient: string): boolean {
    // Airwallex handles fiat — USD, EUR, GBP, HKD, etc.
    // Supports IBAN, sort code, ABA, and generic bank recipients
    const fiatCurrencies = ['USD', 'EUR', 'GBP', 'HKD', 'SGD', 'AUD', 'CAD', 'JPY', 'CNY', 'CHF']
    const isFiat = fiatCurrencies.includes(currency.toUpperCase())
    const isBank = isIban(recipient) || isUkSortCode(recipient) || isUsAba(recipient) ||
      (!isEvmAddress(recipient) && !isUrl(recipient) && !isStripeId(recipient))
    return isFiat && isBank
  },
  estimateLatency(): number {
    return 86400 // ~1 business day for international wires
  },
  estimateCost(amount: number, currency: string): { rail_fee: number; currency: string } {
    // Airwallex charges ~0.5% or $5 minimum
    return { rail_fee: Math.max(5, amount * 0.005), currency }
  },
}

const wiseAdapter: RailAdapter = {
  name: 'wise',
  execute: (envelope, params) => wisePay(envelope, params),
  supports(currency: string, recipient: string): boolean {
    // Wise handles fiat transfers with IBAN, sort code, ABA routing
    const fiatCurrencies = ['USD', 'EUR', 'GBP', 'HKD', 'SGD', 'AUD', 'CAD', 'JPY']
    const isFiat = fiatCurrencies.includes(currency.toUpperCase())
    const isBank = isIban(recipient) || isUkSortCode(recipient) || isUsAba(recipient)
    return isFiat && isBank
  },
  estimateLatency(): number {
    return 43200 // ~12 hours (Wise is typically faster than SWIFT)
  },
  estimateCost(amount: number, currency: string): { rail_fee: number; currency: string } {
    // Wise charges ~0.35% + small fixed fee
    return { rail_fee: Math.max(1.5, amount * 0.0035), currency }
  },
}

const stripeAdapter: RailAdapter = {
  name: 'stripe',
  execute: (envelope, params) => stripePay(envelope, params),
  supports(currency: string, recipient: string): boolean {
    // Stripe handles card/invoice payments — USD/EUR + Stripe ID recipients
    const stripeCurrencies = ['USD', 'EUR', 'GBP', 'AUD', 'CAD']
    const isFiat = stripeCurrencies.includes(currency.toUpperCase())
    return isFiat && isStripeId(recipient)
  },
  estimateLatency(): number {
    return 5 // near-instant (seconds)
  },
  estimateCost(amount: number, currency: string): { rail_fee: number; currency: string } {
    // Stripe charges 2.9% + $0.30 per transaction
    return { rail_fee: amount * 0.029 + 0.30, currency }
  },
}

const usdcBaseAdapter: RailAdapter = {
  name: 'usdc-base',
  execute: (envelope, params, config?: RailConfig) => usdcBasePay(envelope, params, config?.usdcBase),
  supports(currency: string, recipient: string): boolean {
    // USDC-Base handles USDC on Base L2 to EVM addresses
    const isUsdcOrEth = ['USDC', 'ETH'].includes(currency.toUpperCase())
    return isUsdcOrEth && isEvmAddress(recipient)
  },
  estimateLatency(): number {
    return 2 // ~2 seconds on Base L2
  },
  estimateCost(amount: number, _currency: string): { rail_fee: number; currency: string } {
    // Base L2 gas fees are very low — typically <$0.01
    return { rail_fee: 0.005, currency: 'USDC' }
  },
} as RailAdapter

const x402Adapter: RailAdapter = {
  name: 'x402',
  execute: (envelope, params) => x402Pay(envelope, params),
  supports(currency: string, recipient: string): boolean {
    // x402 handles micropayments to HTTP(S) endpoints
    const isUsdcOrEth = ['USDC', 'ETH'].includes(currency.toUpperCase())
    return isUsdcOrEth && isUrl(recipient)
  },
  estimateLatency(): number {
    return 3 // ~3 seconds (HTTP roundtrip + on-chain confirmation)
  },
  estimateCost(amount: number, _currency: string): { rail_fee: number; currency: string } {
    // x402 protocol fee is effectively 0 (micropayment is the fee)
    return { rail_fee: 0, currency: 'USDC' }
  },
}

// ---------------------------------------------------------------------------
// All adapters registry
// ---------------------------------------------------------------------------

export const ALL_ADAPTERS: RailAdapter[] = [
  airwallexAdapter,
  wiseAdapter,
  stripeAdapter,
  usdcBaseAdapter,
  x402Adapter,
]

const ADAPTER_MAP = new Map<Rail, RailAdapter>(
  ALL_ADAPTERS.map((a) => [a.name, a]),
)

// ---------------------------------------------------------------------------
// selectRail — intelligent routing
// ---------------------------------------------------------------------------

/**
 * Intelligently selects the best rail adapter for a given payment.
 *
 * Routing logic:
 *   1. If envelope.rail is set → use it (explicit override, highest priority)
 *   2. Recipient format determines primary candidates:
 *      - EVM address → USDC-Base
 *      - HTTP(S) URL → x402
 *      - Stripe ID (in_, pi_, plink_) → Stripe
 *      - IBAN / sort code / ABA → Wise (preferred) or Airwallex
 *   3. Currency filter: USDC/ETH → crypto rails; USD/EUR/GBP/etc → fiat rails
 *   4. Amount tier: micropayments (<$5) prefer x402; large amounts (>$50K) prefer Airwallex
 *   5. If multiple candidates remain → pick lowest cost
 *
 * @throws Error if no compatible rail is found
 */
export function selectRail(
  envelope: SpendEnvelope,
  request: PaymentRequest,
): RailAdapter {
  const currency = envelope.currency.toUpperCase()
  const { recipient, amount } = request

  // 1. Explicit rail override
  if (envelope.rail) {
    const adapter = ADAPTER_MAP.get(envelope.rail)
    if (!adapter) throw new Error(`PQSafe/selectRail: unknown rail "${envelope.rail}"`)
    return adapter
  }

  // 2. Recipient-format-first routing (highest signal)
  if (isEvmAddress(recipient)) {
    // EVM address → USDC-Base
    return usdcBaseAdapter
  }

  if (isUrl(recipient)) {
    // HTTP URL → x402 micropayment protocol
    return x402Adapter
  }

  if (isStripeId(recipient)) {
    // Stripe invoice/PI/payment-link → Stripe
    return stripeAdapter
  }

  // 3. Bank recipient (IBAN, sort code, ABA, or generic)
  const isBankRecipient =
    isIban(recipient) || isUkSortCode(recipient) || isUsAba(recipient)

  const isCrypto = ['USDC', 'ETH', 'BTC'].includes(currency)
  if (isCrypto) {
    // Crypto currency but non-EVM recipient — fall back to USDC-Base if possible
    // (caller should use an EVM address for crypto transfers)
    throw new Error(
      `PQSafe/selectRail: crypto currency "${currency}" requires an EVM address recipient. ` +
      `Got: "${recipient}". Use 0x... address format for USDC/ETH transfers.`,
    )
  }

  // 4. Fiat bank transfer — choose between Wise and Airwallex
  if (isBankRecipient || (!isEvmAddress(recipient) && !isUrl(recipient) && !isStripeId(recipient))) {
    // Amount tier: large transfers >$50K → prefer Airwallex (better compliance, higher limits)
    if (amount > 50_000) {
      return airwallexAdapter
    }
    // Default fiat bank: Wise (faster, cheaper)
    return wiseAdapter
  }

  // 5. No matching rail found
  const candidates = ALL_ADAPTERS.filter((a) => a.supports(currency, recipient))
  if (candidates.length === 0) {
    throw new Error(
      `PQSafe/selectRail: no rail supports currency="${currency}" recipient="${recipient}". ` +
      `Supported: IBAN/sort-code/ABA → Wise/Airwallex; 0x address → USDC-Base; ` +
      `https:// URL → x402; in_/pi_/plink_ → Stripe.`,
    )
  }

  // Pick the lowest-cost candidate
  return candidates.sort(
    (a, b) => a.estimateCost(amount, currency).rail_fee - b.estimateCost(amount, currency).rail_fee,
  )[0]
}

// ---------------------------------------------------------------------------
// routePayment — executes payment via selectRail or explicit rail
// ---------------------------------------------------------------------------

/** Default rail when envelope.rail is not set */
const DEFAULT_RAIL: Rail = 'airwallex'

/**
 * Route a payment request to the appropriate rail connector.
 *
 * Uses selectRail() when envelope.rail is not set, otherwise dispatches
 * directly to the named rail for backwards compatibility.
 */
export async function routePayment(
  envelope: SpendEnvelope,
  request: PaymentRequest,
  railConfig?: RailConfig,
): Promise<PaymentResult> {
  const rail = envelope.rail ?? DEFAULT_RAIL

  switch (rail) {
    case 'airwallex':
      return airwallexPay(envelope, request)

    case 'wise':
      return wisePay(envelope, request)

    case 'stripe':
      return stripePay(envelope, request)

    case 'usdc-base':
      return usdcBasePay(envelope, request, railConfig?.usdcBase)

    case 'x402':
      return x402Pay(envelope, request)

    default: {
      const _exhaustive: never = rail
      throw new Error(`Unknown rail: ${String(_exhaustive)}`)
    }
  }
}
