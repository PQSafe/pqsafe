/**
 * PQSafe AgentPay — guardrail test suite (Vitest)
 *
 * ML-DSA-65 signing + envelope policy enforcement.
 * Every test here corresponds to a security claim on pqsafe.xyz.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import {
  createEnvelope,
  signEnvelope,
  verifyEnvelope,
  executeAgentPayment,
  setAgentPayConfig,
} from '../src/index.js'
import type { SignedEnvelope } from '../src/types.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function freshKeypair() {
  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const address = 'pq1' + bytesToHex(keccak_256(publicKey).slice(0, 20))
  return { publicKey, secretKey, address }
}

const GOOD_RECIPIENT = 'GB29NWBK60161331926819'
const BAD_RECIPIENT = 'ATTACKER_ACCOUNT_XYZ'

function buildValidEnvelope(issuer: string) {
  return createEnvelope({
    issuer,
    agent: 'test-agent',
    maxAmount: 200,
    currency: 'USD',
    allowedRecipients: [GOOD_RECIPIENT],
    ttlSeconds: 3600,
    rail: 'airwallex',
  })
}

// ---------------------------------------------------------------------------
// Signing round-trip
// ---------------------------------------------------------------------------

describe('signing round-trip', () => {
  beforeAll(() => {
    setAgentPayConfig({ mockMode: true })
  })

  it('sign → verify round-trip returns the same envelope', () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    const verified = verifyEnvelope(signed)
    expect(verified.issuer).toBe(env.issuer)
    expect(verified.agent).toBe(env.agent)
    expect(verified.nonce).toBe(env.nonce)
    expect(verified.maxAmount).toBe(env.maxAmount)
  })

  it('verify fails when signature is flipped to another issuer', () => {
    const alice = freshKeypair()
    const mallory = freshKeypair()
    const env = buildValidEnvelope(alice.address)
    const signed = signEnvelope(env, mallory.secretKey, alice.publicKey)
    expect(() => verifyEnvelope(signed)).toThrow()
  })

  it('verify fails when envelopeJson is tampered after signing', () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    const tampered: SignedEnvelope = {
      ...signed,
      envelopeJson: signed.envelopeJson.replace('"maxAmount":200', '"maxAmount":999999'),
    }
    expect(() => verifyEnvelope(tampered)).toThrow(/verification failed/)
  })

  it('verify fails when signature bytes are corrupted', () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    const sigBytes = hexToBytes(signed.signature)
    sigBytes[100] = sigBytes[100] ^ 0xff
    const tampered: SignedEnvelope = { ...signed, signature: bytesToHex(sigBytes) }
    expect(() => verifyEnvelope(tampered)).toThrow(/verification failed/)
  })
})

// ---------------------------------------------------------------------------
// Temporal guardrails
// ---------------------------------------------------------------------------

describe('temporal guardrails', () => {
  it('verify rejects envelope that has not yet activated', () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = createEnvelope({
      issuer: address,
      agent: 'test-agent',
      maxAmount: 100,
      currency: 'USD',
      allowedRecipients: [GOOD_RECIPIENT],
      startsInSeconds: 3600,
      ttlSeconds: 7200,
    })
    const signed = signEnvelope(env, secretKey, publicKey)
    expect(() => verifyEnvelope(signed)).toThrow(/not yet active/)
  })

  it('verify rejects envelope that has expired', () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const expired = {
      ...env,
      validFrom: env.validFrom - 7200,
      validUntil: env.validFrom - 3600,
    }
    const signed = signEnvelope(expired, secretKey, publicKey)
    expect(() => verifyEnvelope(signed)).toThrow(/expired/)
  })
})

// ---------------------------------------------------------------------------
// Policy guardrails at execution time
// ---------------------------------------------------------------------------

describe('executeAgentPayment policy guardrails', () => {
  beforeAll(() => {
    setAgentPayConfig({ mockMode: true })
  })

  it('executeAgentPayment succeeds on an in-policy request', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: GOOD_RECIPIENT,
      amount: 50,
      memo: 'in-policy test',
    })
    expect(result.success).toBe(true)
    expect(result.rail).toBe('airwallex')
    expect(result.amount).toBe(50)
    expect(result.meta?.mock).toBe(true)
  })

  it('executeAgentPayment rejects amount over ceiling', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    await expect(
      executeAgentPayment(signed, { recipient: GOOD_RECIPIENT, amount: 201 }),
    ).rejects.toThrow(/exceeds envelope maxAmount/)
  })

  it('executeAgentPayment rejects recipient not in allowlist', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    await expect(
      executeAgentPayment(signed, { recipient: BAD_RECIPIENT, amount: 10 }),
    ).rejects.toThrow(/not in the envelope allowlist/)
  })

  it('executeAgentPayment rejects zero amount', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    await expect(
      executeAgentPayment(signed, { recipient: GOOD_RECIPIENT, amount: 0 }),
    ).rejects.toThrow(/must be positive/)
  })

  it('executeAgentPayment rejects negative amount', async () => {
    const { publicKey, secretKey, address } = freshKeypair()
    const env = buildValidEnvelope(address)
    const signed = signEnvelope(env, secretKey, publicKey)
    await expect(
      executeAgentPayment(signed, { recipient: GOOD_RECIPIENT, amount: -5 }),
    ).rejects.toThrow(/must be positive/)
  })
})

// ---------------------------------------------------------------------------
// Schema guardrails
// ---------------------------------------------------------------------------

describe('createEnvelope schema guardrails', () => {
  it('rejects empty allowlist', () => {
    const { address } = freshKeypair()
    expect(() =>
      createEnvelope({
        issuer: address,
        agent: 'test-agent',
        maxAmount: 100,
        currency: 'USD',
        allowedRecipients: [],
      }),
    ).toThrow()
  })

  it('rejects malformed issuer address', () => {
    expect(() =>
      createEnvelope({
        issuer: 'not-a-pqsafe-address',
        agent: 'test-agent',
        maxAmount: 100,
        currency: 'USD',
        allowedRecipients: [GOOD_RECIPIENT],
      }),
    ).toThrow()
  })

  it('rejects non-positive maxAmount', () => {
    const { address } = freshKeypair()
    expect(() =>
      createEnvelope({
        issuer: address,
        agent: 'test-agent',
        maxAmount: 0,
        currency: 'USD',
        allowedRecipients: [GOOD_RECIPIENT],
      }),
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Wise rail (mock mode)
// ---------------------------------------------------------------------------

describe('Wise rail (mock mode)', () => {
  it('Wise rail executes in mock mode (IBAN recipient)', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'wise-test-agent',
      maxAmount: 100,
      currency: 'GBP',
      allowedRecipients: ['GB29NWBK60161331926819'],
      rail: 'wise',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: 'GB29NWBK60161331926819',
      amount: 50,
      memo: 'Wise IBAN test',
    })
    expect(result.success).toBe(true)
    expect(result.rail).toBe('wise')
    expect(result.txId).toMatch(/^wise_sbx_/)
    expect(result.amount).toBe(50)
    setAgentPayConfig({ mockMode: false })
  })

  it('Wise rail respects amount ceiling', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'wise-ceiling-agent',
      maxAmount: 30,
      currency: 'GBP',
      allowedRecipients: ['GB29NWBK60161331926819'],
      rail: 'wise',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    await expect(
      executeAgentPayment(signed, { recipient: 'GB29NWBK60161331926819', amount: 31 }),
    ).rejects.toThrow('exceeds envelope maxAmount')
    setAgentPayConfig({ mockMode: false })
  })
})

// ---------------------------------------------------------------------------
// Approval gate (mock mode)
// ---------------------------------------------------------------------------

describe('executeWithApproval', () => {
  it('auto-approves below threshold', async () => {
    const { executeWithApproval } = await import('../src/approval.js')
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'approval-test-agent',
      maxAmount: 200,
      currency: 'USD',
      allowedRecipients: [GOOD_RECIPIENT],
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeWithApproval(
      signed,
      { recipient: GOOD_RECIPIENT, amount: 50, memo: 'auto-approved test' },
      { autoApproveThreshold: 100 },
    )
    expect(result.success).toBe(true)
    setAgentPayConfig({ mockMode: false })
  })

  it('throws above threshold when no Telegram config', async () => {
    const { executeWithApproval } = await import('../src/approval.js')
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'approval-gate-agent',
      maxAmount: 200,
      currency: 'USD',
      allowedRecipients: [GOOD_RECIPIENT],
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    await expect(
      executeWithApproval(
        signed,
        { recipient: GOOD_RECIPIENT, amount: 150 },
        { autoApproveThreshold: 100 },
      ),
    ).rejects.toThrow('threshold')
    setAgentPayConfig({ mockMode: false })
  })
})

// ---------------------------------------------------------------------------
// USDC-Base rail (mock mode)
// ---------------------------------------------------------------------------

describe('USDC-Base rail (mock mode)', () => {
  const EVM_RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

  it('USDC-Base rail executes in mock mode (EVM address)', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'usdc-base-test-agent',
      maxAmount: 500,
      currency: 'USDC',
      allowedRecipients: [EVM_RECIPIENT],
      rail: 'usdc-base',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: EVM_RECIPIENT,
      amount: 100,
      memo: 'USDC-Base mock test',
    })
    expect(result.success).toBe(true)
    expect(result.rail).toBe('usdc-base')
    expect(result.txId).toMatch(/^0x[0-9a-f]{64}$/)
    expect(result.amount).toBe(100)
    expect(result.currency).toBe('USDC')
    expect(result.meta?.mock).toBe(true)
    setAgentPayConfig({ mockMode: false })
  })

  it('USDC-Base rejects non-EVM recipient', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'usdc-base-reject-agent',
      maxAmount: 500,
      currency: 'USDC',
      allowedRecipients: [GOOD_RECIPIENT],
      rail: 'usdc-base',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    await expect(
      executeAgentPayment(signed, { recipient: GOOD_RECIPIENT, amount: 50 }),
    ).rejects.toThrow(/EVM address/)
    setAgentPayConfig({ mockMode: false })
  })

  it('toUsdcAtomicUnits converts decimals correctly', async () => {
    const { toUsdcAtomicUnits } = await import('../src/rails/usdc-base.js')
    expect(toUsdcAtomicUnits(1)).toBe(1_000_000n)
    expect(toUsdcAtomicUnits(1.5)).toBe(1_500_000n)
    expect(toUsdcAtomicUnits(100)).toBe(100_000_000n)
    expect(toUsdcAtomicUnits(0.000001)).toBe(1n)
  })

  it('encodeTransferCalldata produces 68-byte 0x-prefixed calldata', async () => {
    const { encodeTransferCalldata, toUsdcAtomicUnits } = await import('../src/rails/usdc-base.js')
    const to = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    const amount = toUsdcAtomicUnits(100)
    const calldata = encodeTransferCalldata(to, amount)
    expect(calldata).toMatch(/^0x/)
    expect(calldata.length).toBe(138)
    expect(calldata).toMatch(/^0xa9059cbb/)
  })
})

// ---------------------------------------------------------------------------
// Stripe rail (mock mode)
// ---------------------------------------------------------------------------

describe('Stripe rail (mock mode)', () => {
  it('Stripe rail executes in mock mode (invoice ID recipient)', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const STRIPE_INVOICE = 'in_1PXqBBGJhmH2PkSTDemoTest123'
    const envelope = createEnvelope({
      issuer: address,
      agent: 'stripe-test-agent',
      maxAmount: 500,
      currency: 'USD',
      allowedRecipients: [STRIPE_INVOICE],
      rail: 'stripe',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: STRIPE_INVOICE,
      amount: 49,
      memo: 'Anthropic API credits',
    })
    expect(result.success).toBe(true)
    expect(result.rail).toBe('stripe')
    expect(result.txId).toMatch(/^pi_sbx_/)
    expect(result.meta?.recipientType).toBe('invoice')
    setAgentPayConfig({ mockMode: false })
  })
})

// ---------------------------------------------------------------------------
// x402 rail (mock mode)
// ---------------------------------------------------------------------------

describe('x402 rail (mock mode)', () => {
  it('x402 rail executes in mock mode (URL-style recipient)', async () => {
    setAgentPayConfig({ mockMode: true })
    const { address, secretKey, publicKey } = freshKeypair()
    const X402_RECIPIENT = 'https://api.example.com/premium-data'
    const envelope = createEnvelope({
      issuer: address,
      agent: 'x402-test-agent',
      maxAmount: 10,
      currency: 'USDC',
      allowedRecipients: [X402_RECIPIENT],
      rail: 'x402',
    })
    const signed = signEnvelope(envelope, secretKey, publicKey)
    const result = await executeAgentPayment(signed, {
      recipient: X402_RECIPIENT,
      amount: 0.001,
      memo: 'x402 micropayment',
    })
    expect(result.success).toBe(true)
    expect(result.rail).toBe('x402')
    expect(result.txId).toMatch(/^x402_sbx_/)
    expect(result.meta?.protocol).toBe('x402')
    setAgentPayConfig({ mockMode: false })
  })
})
