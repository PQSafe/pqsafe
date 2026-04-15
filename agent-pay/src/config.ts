/**
 * Runtime configuration for PQSafe AgentPay.
 *
 * Credentials are loaded from environment variables so the SDK can be used
 * in Node scripts, serverless functions, and CI without leaking secrets into
 * the codebase. In browser/extension contexts, callers inject config via
 * `setAgentPayConfig()` instead.
 */

export interface AgentPayConfig {
  airwallex: {
    clientId: string | null
    apiKey: string | null
    /** 'sandbox' uses demo.airwallex.com; 'live' uses api.airwallex.com */
    env: 'sandbox' | 'live'
  }
  /** When true, rails return mocked PaymentResults instead of hitting real APIs */
  mockMode: boolean
}

function readEnv(key: string): string | null {
  // Node / Bun / Deno
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string
  }
  return null
}

let cached: AgentPayConfig | null = null

export function getAgentPayConfig(): AgentPayConfig {
  if (cached) return cached

  const clientId = readEnv('AIRWALLEX_CLIENT_ID')
  const apiKey = readEnv('AIRWALLEX_API_KEY')
  const envMode = (readEnv('AIRWALLEX_ENV') === 'live' ? 'live' : 'sandbox') as
    | 'sandbox'
    | 'live'
  const forceMock = readEnv('PQSAFE_MOCK_MODE') === '1'

  cached = {
    airwallex: {
      clientId,
      apiKey,
      env: envMode,
    },
    // Auto-mock when no creds present. Explicit override via PQSAFE_MOCK_MODE=1.
    mockMode: forceMock || !clientId || !apiKey,
  }
  return cached
}

/** Override config at runtime (for browser/extension/test contexts) */
export function setAgentPayConfig(cfg: Partial<AgentPayConfig>): void {
  const current = getAgentPayConfig()
  cached = {
    ...current,
    ...cfg,
    airwallex: { ...current.airwallex, ...(cfg.airwallex ?? {}) },
  }
}

export function getAirwallexBaseUrl(): string {
  const cfg = getAgentPayConfig()
  return cfg.airwallex.env === 'live'
    ? 'https://api.airwallex.com/api/v1'
    : 'https://api-demo.airwallex.com/api/v1'
}
