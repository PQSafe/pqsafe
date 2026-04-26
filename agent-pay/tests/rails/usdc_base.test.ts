/**
 * USDC-Base rail tests — no real credentials required (Vitest)
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  executePayment,
  encodeTransferCalldata,
  toUsdcAtomicUnits,
  type UsdcBaseConfig,
} from '../../src/rails/usdc-base.js'
import type { SpendEnvelope } from '../../src/envelope.js'
import type { PaymentRequest } from '../../src/types.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EVM_RECIPIENT = '0x' + 'a'.repeat(40)
const MOCK_TX_HASH = '0x' + 'b'.repeat(64)

function makeEnvelope(overrides?: Partial<SpendEnvelope>): SpendEnvelope {
  const now = Math.floor(Date.now() / 1000)
  return {
    version: 1,
    issuer: 'pq1' + 'c'.repeat(40),
    agent: 'usdc-agent-v1',
    maxAmount: 1000,
    currency: 'USDC',
    allowedRecipients: [EVM_RECIPIENT],
    validFrom: now - 60,
    validUntil: now + 3600,
    nonce: '11223344' + '00'.repeat(12),
    rail: 'usdc-base',
    ...overrides,
  }
}

function makeRequest(overrides?: Partial<PaymentRequest>): PaymentRequest {
  return { recipient: EVM_RECIPIENT, amount: 10.5, memo: 'usdc test transfer', ...overrides }
}

function makeStubSigner(returnHash: string = MOCK_TX_HASH): UsdcBaseConfig['signAndSend'] {
  return async (_params) => returnHash
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('USDC-Base rail', () => {
  afterEach(() => {
    process.env.PQSAFE_MOCK_MODE = '1'
    delete process.env.BASE_NETWORK
  })

  it('encodeTransferCalldata produces valid 68-byte calldata', () => {
    const calldata = encodeTransferCalldata(EVM_RECIPIENT, 10_500_000n)

    expect(calldata).toMatch(/^0x/)
    const bytes = (calldata.length - 2) / 2
    expect(bytes).toBe(68)
    expect(calldata).toMatch(/^0xa9059cbb/)

    const encodedRecipient = calldata.slice(10, 74)
    expect(encodedRecipient.toLowerCase()).toContain(EVM_RECIPIENT.slice(2).toLowerCase())
  })

  it('signAndSend injection submits transfer and returns txHash', async () => {
    process.env.BASE_NETWORK = 'sepolia'
    process.env.PQSAFE_MOCK_MODE = '0'

    const config: UsdcBaseConfig = { network: 'sepolia', signAndSend: makeStubSigner(MOCK_TX_HASH) }
    const result = await executePayment(makeEnvelope(), makeRequest({ amount: 25 }), config)

    expect(result.success).toBe(true)
    expect(result.rail).toBe('usdc-base')
    expect(result.txId).toBe(MOCK_TX_HASH)
    expect(result.currency).toBe('USDC')
    expect(result.meta?.mock).toBe(false)
    expect(result.meta?.network).toBe('sepolia')
    expect(result.meta?.atomicAmount).toBe('25000000')
  })

  it('mock mode returns txHash without signing (waitForReceipt pattern)', async () => {
    process.env.PQSAFE_MOCK_MODE = '1'
    delete process.env.BASE_NETWORK

    const config: UsdcBaseConfig = { network: 'sepolia' }
    const result = await executePayment(makeEnvelope(), makeRequest({ amount: 5 }), config)

    expect(result.success).toBe(true)
    expect(result.txId).toMatch(/^0x/)
    expect(result.txId.length).toBe(66)
    expect(result.meta?.mock).toBe(true)
    expect(result.currency).toBe('USDC')
  })

  it('toUsdcAtomicUnits converts decimals correctly (6 dp)', () => {
    expect(toUsdcAtomicUnits(1)).toBe(1_000_000n)
    expect(toUsdcAtomicUnits(1.5)).toBe(1_500_000n)
    expect(toUsdcAtomicUnits(0.01)).toBe(10_000n)
    expect(toUsdcAtomicUnits(100)).toBe(100_000_000n)
    expect(toUsdcAtomicUnits(0.000001)).toBe(1n)
  })

  it('non-EVM recipient address is rejected', async () => {
    process.env.PQSAFE_MOCK_MODE = '0'
    const config: UsdcBaseConfig = { network: 'sepolia', signAndSend: makeStubSigner() }
    const env = makeEnvelope({ allowedRecipients: ['GB29NWBK60161331926819'] })
    const req = makeRequest({ recipient: 'GB29NWBK60161331926819' })

    await expect(executePayment(env, req, config)).rejects.toThrow(/must be a 0x EVM address/)
  })
})
