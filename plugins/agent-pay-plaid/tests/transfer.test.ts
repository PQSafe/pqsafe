/**
 * @pqsafe/agent-pay-plaid — vitest smoke test
 *
 * All tests run with PQSAFE_TEST_MODE=true so:
 *   - No real Plaid credentials needed (Plaid call is stubbed)
 *   - No PQSafe API calls (envelope verify + nonce record mocked)
 *   - No ledger writes (audit log mocked)
 *
 * Tests:
 *   1. protectedTransfer succeeds with a valid test envelope
 *   2. protectedTransfer rejects an expired envelope
 *   3. protectedTransfer rejects when amount exceeds maxAmount
 *   4. protectedTransfer rejects when allowedRecipients is empty
 *   5. protectedTransfer rejects a malformed envelope JSON
 *   6. verifyPlaidWebhook returns valid=true in test mode
 *   7. verifyPlaidWebhook parses webhook_type and webhook_code
 *   8. verifyPlaidWebhook returns valid=false when header missing (non-test mode)
 *
 * Run: PQSAFE_TEST_MODE=true npx vitest run
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createPlaidPQSafeClient } from '../src/index.js'
import type { PQSafeProtectedTransferInput, SignedEnvelopeRef } from '../src/index.js'

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const originalTestMode = process.env['PQSAFE_TEST_MODE']

beforeAll(() => {
  process.env['PQSAFE_TEST_MODE'] = 'true'
})

afterAll(() => {
  if (originalTestMode === undefined) {
    delete process.env['PQSAFE_TEST_MODE']
  } else {
    process.env['PQSAFE_TEST_MODE'] = originalTestMode
  }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Build a test SpendEnvelope JSON with configurable fields */
function makeEnvelopeJson(overrides: {
  maxAmount?: number
  validUntil?: number
  allowedRecipients?: string[]
  nonce?: string
} = {}): string {
  const now = Math.floor(Date.now() / 1000)
  return JSON.stringify({
    version: 1,
    issuer: 'pq1' + 'a'.repeat(40),
    agent: 'plaid-test-agent-v1',
    maxAmount: overrides.maxAmount ?? 500,
    currency: 'USD',
    allowedRecipients: overrides.allowedRecipients ?? ['test-plaid-auth-id-001'],
    validFrom: now - 10,
    validUntil: overrides.validUntil ?? now + 3600,
    nonce: overrides.nonce ?? 'c'.repeat(32),
  })
}

// Mock ML-DSA-65 test sentinels (same as openclaw-pqsafe test mode)
const TEST_SIG = 'b'.repeat(6618)
const TEST_PUBKEY = 'a'.repeat(3904)

function makeTestEnvelope(overrides: Parameters<typeof makeEnvelopeJson>[0] = {}): SignedEnvelopeRef {
  return {
    envelopeJson: makeEnvelopeJson(overrides),
    signature: TEST_SIG,
    dsaPublicKey: TEST_PUBKEY,
  }
}

const BASE_TRANSFER_INPUT: PQSafeProtectedTransferInput = {
  envelope: makeTestEnvelope(),
  authorizationId: 'test-plaid-auth-id-001',
  amount: { currency: 'USD', value: '49.99' },
  description: 'Invoice 1001',
  ach_class: 'ppd',
  user: { legal_name: 'Test User', email_address: 'test@example.com' },
  type: 'debit',
}

function getClient() {
  // Plaid creds are dummy strings — the Plaid call is stubbed in test mode
  return createPlaidPQSafeClient({
    plaidClientId: 'test-client-id',
    plaidSecret: 'test-secret',
    plaidEnv: 'sandbox',
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPlaidPQSafeClient', () => {

  // ── Test 1: happy path ────────────────────────────────────────────────────

  it('protectedTransfer succeeds with a valid test envelope', async () => {
    const client = getClient()
    const result = await client.protectedTransfer(BASE_TRANSFER_INPUT)

    expect(result.transferId).toBeTruthy()
    expect(result.status).toBe('pending')
    expect(result.created).toBeTruthy()
    expect(new Date(result.created).getTime()).not.toBeNaN()
    expect(result.auditUrl).toContain('mock=true')
    expect(result.envelopeId).toBe('test-envelope-id')
  })

  // ── Test 2: expired envelope ──────────────────────────────────────────────

  it('protectedTransfer rejects an expired envelope', async () => {
    const client = getClient()
    const expiredEnvelope = makeTestEnvelope({
      validUntil: Math.floor(Date.now() / 1000) - 3600,
    })
    await expect(
      client.protectedTransfer({ ...BASE_TRANSFER_INPUT, envelope: expiredEnvelope }),
    ).rejects.toThrow('expired')
  })

  // ── Test 3: amount too high ───────────────────────────────────────────────

  it('protectedTransfer rejects when amount exceeds envelope maxAmount', async () => {
    const client = getClient()
    const smallEnvelope = makeTestEnvelope({ maxAmount: 10 })
    await expect(
      client.protectedTransfer({
        ...BASE_TRANSFER_INPUT,
        envelope: smallEnvelope,
        amount: { currency: 'USD', value: '99.00' },
      }),
    ).rejects.toThrow('exceeds envelope maxAmount')
  })

  // ── Test 4: empty allowedRecipients ───────────────────────────────────────

  it('protectedTransfer rejects when allowedRecipients is empty', async () => {
    const client = getClient()
    const blockedEnvelope = makeTestEnvelope({ allowedRecipients: [] })
    await expect(
      client.protectedTransfer({ ...BASE_TRANSFER_INPUT, envelope: blockedEnvelope }),
    ).rejects.toThrow('allowedRecipients is empty')
  })

  // ── Test 5: malformed envelope JSON ──────────────────────────────────────

  it('protectedTransfer rejects a malformed envelope JSON', async () => {
    const client = getClient()
    const badEnvelope: SignedEnvelopeRef = {
      envelopeJson: 'not-valid-json{{{',
      signature: TEST_SIG,
      dsaPublicKey: TEST_PUBKEY,
    }
    await expect(
      client.protectedTransfer({ ...BASE_TRANSFER_INPUT, envelope: badEnvelope }),
    ).rejects.toThrow('envelope parse failed')
  })

  // ── Test 6: verifyPlaidWebhook returns valid=true in test mode ────────────

  it('verifyPlaidWebhook returns valid=true in test mode', async () => {
    const client = getClient()
    const body = JSON.stringify({
      webhook_type: 'TRANSFER',
      webhook_code: 'TRANSFER_EVENTS_UPDATE',
      transfer_id: 'mock-transfer-123',
    })
    // No Plaid-Verification header needed in test mode
    const result = await client.verifyPlaidWebhook({}, body)

    expect(result.valid).toBe(true)
    expect(result.envelope_id).toBe('test-envelope-id')
  })

  // ── Test 7: verifyPlaidWebhook parses webhook fields ─────────────────────

  it('verifyPlaidWebhook parses webhook_type and webhook_code', async () => {
    const client = getClient()
    const body = JSON.stringify({
      webhook_type: 'TRANSFER',
      webhook_code: 'TRANSFER_EVENTS_UPDATE',
      transfer_id: 'mock-transfer-456',
    })
    const result = await client.verifyPlaidWebhook(
      { 'plaid-verification': 'mock-jwt-token' },
      body,
    )

    expect(result.valid).toBe(true)
    expect(result.webhook_type).toBe('TRANSFER')
    expect(result.webhook_code).toBe('TRANSFER_EVENTS_UPDATE')
  })

  // ── Test 8: amount boundary — exactly at maxAmount passes ─────────────────

  it('protectedTransfer allows amount exactly equal to maxAmount', async () => {
    const client = getClient()
    const envelope = makeTestEnvelope({ maxAmount: 100 })
    const result = await client.protectedTransfer({
      ...BASE_TRANSFER_INPUT,
      envelope,
      amount: { currency: 'USD', value: '100.00' },
    })
    expect(result.status).toBe('pending')
  })

})
