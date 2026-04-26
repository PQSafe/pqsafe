/**
 * selectRail() routing logic tests (Vitest)
 */

import { describe, it, expect } from 'vitest'
import { selectRail, ALL_ADAPTERS } from '../../src/rails/index.js'
import type { SpendEnvelope } from '../../src/envelope.js'
import type { PaymentRequest } from '../../src/types.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEnvelope(
  currency: string,
  recipients: string[],
  overrides?: Partial<SpendEnvelope>,
): SpendEnvelope {
  const now = Math.floor(Date.now() / 1000)
  return {
    version: 1,
    issuer: 'pq1' + 'e'.repeat(40),
    agent: 'router-agent-v1',
    maxAmount: 1000,
    currency,
    allowedRecipients: recipients,
    validFrom: now - 60,
    validUntil: now + 3600,
    nonce: '99887766' + '00'.repeat(12),
    ...overrides,
  }
}

function makeRequest(recipient: string, amount: number = 100): PaymentRequest {
  return { recipient, amount, memo: 'routing test' }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectRail() routing', () => {
  it('EVM address recipient routes to usdc-base', () => {
    const evmAddress = '0x' + 'a'.repeat(40)
    const adapter = selectRail(makeEnvelope('USDC', [evmAddress]), makeRequest(evmAddress, 50))
    expect(adapter.name).toBe('usdc-base')
  })

  it('HTTPS URL recipient routes to x402', () => {
    const url = 'https://api.example.com/premium-endpoint'
    const adapter = selectRail(makeEnvelope('USDC', [url]), makeRequest(url, 1))
    expect(adapter.name).toBe('x402')
  })

  it('Stripe invoice ID (in_xxx) routes to stripe', () => {
    const invoiceId = 'in_test_abc123xyz'
    const adapter = selectRail(makeEnvelope('USD', [invoiceId]), makeRequest(invoiceId, 99))
    expect(adapter.name).toBe('stripe')
  })

  it('Stripe payment intent (pi_xxx) routes to stripe', () => {
    const piId = 'pi_test_payment_intent001'
    const adapter = selectRail(makeEnvelope('USD', [piId]), makeRequest(piId, 49))
    expect(adapter.name).toBe('stripe')
  })

  it('IBAN recipient routes to wise for amounts < $50K', () => {
    const iban = 'GB29NWBK60161331926819'
    const adapter = selectRail(makeEnvelope('GBP', [iban]), makeRequest(iban, 500))
    expect(adapter.name).toBe('wise')
  })

  it('large amount (> $50K) routes to airwallex for bank transfers', () => {
    const iban = 'DE89370400440532013000'
    const adapter = selectRail(
      makeEnvelope('EUR', [iban], { maxAmount: 100_000 }),
      makeRequest(iban, 75_000),
    )
    expect(adapter.name).toBe('airwallex')
  })

  it('explicit envelope.rail overrides auto-routing', () => {
    const evmAddress = '0x' + 'b'.repeat(40)
    const adapter = selectRail(
      makeEnvelope('USD', [evmAddress], { rail: 'airwallex' }),
      makeRequest(evmAddress, 100),
    )
    expect(adapter.name).toBe('airwallex')
  })

  it('USDC with IBAN recipient throws helpful error', async () => {
    const iban = 'GB29NWBK60161331926819'
    expect(() =>
      selectRail(makeEnvelope('USDC', [iban]), makeRequest(iban, 100)),
    ).toThrow(/requires an EVM address/)
  })
})

describe('RailAdapter capabilities', () => {
  it('each adapter returns correct supports() coverage', () => {
    const adapters = ALL_ADAPTERS

    const usdcAdapter = adapters.find((a) => a.name === 'usdc-base')!
    expect(usdcAdapter.supports('USDC', '0x' + 'a'.repeat(40))).toBe(true)
    expect(usdcAdapter.supports('USD', '0x' + 'a'.repeat(40))).toBe(false)
    expect(usdcAdapter.supports('USDC', 'GB29NWBK60161331926819')).toBe(false)

    const stripeAdap = adapters.find((a) => a.name === 'stripe')!
    expect(stripeAdap.supports('USD', 'in_test_001')).toBe(true)
    expect(stripeAdap.supports('USDC', 'in_test_001')).toBe(false)
    expect(stripeAdap.supports('USD', 'GB29NWBK60161331926819')).toBe(false)

    const wiseAdap = adapters.find((a) => a.name === 'wise')!
    expect(wiseAdap.supports('USD', 'GB29NWBK60161331926819')).toBe(true)
    expect(wiseAdap.supports('USDC', 'GB29NWBK60161331926819')).toBe(false)

    const x402Adap = adapters.find((a) => a.name === 'x402')!
    expect(x402Adap.supports('USDC', 'https://api.example.com/resource')).toBe(true)
    expect(x402Adap.supports('USD', 'https://api.example.com/resource')).toBe(false)
  })

  it('all adapters return valid cost structure', () => {
    for (const adapter of ALL_ADAPTERS) {
      const cost = adapter.estimateCost(100, 'USD')
      expect(typeof cost.rail_fee).toBe('number')
      expect(cost.rail_fee).toBeGreaterThanOrEqual(0)
      expect(typeof cost.currency).toBe('string')
    }

    const x402 = ALL_ADAPTERS.find((a) => a.name === 'x402')!
    const stripe = ALL_ADAPTERS.find((a) => a.name === 'stripe')!
    const wise = ALL_ADAPTERS.find((a) => a.name === 'wise')!
    expect(x402.estimateCost(100, 'USDC').rail_fee).toBeLessThan(stripe.estimateCost(100, 'USD').rail_fee)
    expect(wise.estimateCost(100, 'USD').rail_fee).toBeLessThan(stripe.estimateCost(100, 'USD').rail_fee)
  })

  it('crypto rails faster than fiat rails', () => {
    const usdcBase = ALL_ADAPTERS.find((a) => a.name === 'usdc-base')!
    const x402 = ALL_ADAPTERS.find((a) => a.name === 'x402')!
    const wise = ALL_ADAPTERS.find((a) => a.name === 'wise')!
    const airwallex = ALL_ADAPTERS.find((a) => a.name === 'airwallex')!

    expect(usdcBase.estimateLatency()).toBeLessThan(wise.estimateLatency())
    expect(x402.estimateLatency()).toBeLessThan(wise.estimateLatency())
    expect(wise.estimateLatency()).toBeLessThan(airwallex.estimateLatency())

    for (const adapter of ALL_ADAPTERS) {
      expect(adapter.estimateLatency()).toBeGreaterThan(0)
    }
  })
})
