/**
 * Rail router — selects the correct connector based on envelope.rail
 * and executes the payment.
 *
 * Rail selection priority:
 *   1. If envelope.rail is set → use that rail exclusively.
 *   2. Otherwise → fall back to the default rail (Airwallex for fiat).
 *
 * Adding a new rail:
 *   1. Add the rail name to the Rail type in types.ts
 *   2. Add the rail name to RailSchema in envelope.ts
 *   3. Create src/rails/<rail>.ts implementing executePayment()
 *   4. Add the import and case below
 */

import type { PaymentRequest, PaymentResult, Rail } from '../types.js'
import type { SpendEnvelope } from '../envelope.js'
import type { UsdcBaseConfig } from './usdc-base.js'
import { executePayment as airwallexPay } from './airwallex.js'
import { executePayment as wisePay } from './wise.js'
import { executePayment as usdcBasePay } from './usdc-base.js'
import { executePayment as x402Pay } from './x402.js'

/** Default rail when envelope.rail is not set */
const DEFAULT_RAIL: Rail = 'airwallex'

/** Per-rail configuration passed through from executeAgentPayment */
export interface RailConfig {
  usdcBase?: UsdcBaseConfig
}

/**
 * Route a payment request to the appropriate rail connector.
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
      // TODO: import and call stripe connector
      // return stripePay(envelope, request)
      throw new Error('Rail "stripe" is not yet implemented — coming soon')

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
