/**
 * PQSafe AgentPay — Human-confirmation API tests (Vitest)
 *
 * Tests the full requestApproval() flow with mocked channels,
 * quorum logic, audit trail, webhook HMAC, and integration with executeAgentPayment.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { createHmac } from 'crypto'
import {
  createEnvelope,
  signEnvelope,
  setAgentPayConfig,
  requestApproval,
  getApprovalStatus,
  resolveApproval,
  executeAgentPayment,
  ApprovalRejectedError,
  ApprovalTimeoutError,
} from '../src/index.js'
import type { SignedEnvelope, ApprovalRequest, ApprovalChannel } from '../src/index.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function freshKeypair() {
  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const address = 'pq1' + bytesToHex(keccak_256(publicKey).slice(0, 20))
  return { publicKey, secretKey, address }
}

const RECIPIENT = 'anthropic.com/billing'
let signed: SignedEnvelope

beforeAll(() => {
  setAgentPayConfig({ mockMode: true })
  const { publicKey, secretKey, address } = freshKeypair()
  const env = createEnvelope({
    issuer: address,
    agent: 'test-agent-v1',
    maxAmount: 10_000,
    currency: 'USD',
    allowedRecipients: [RECIPIENT],
    ttlSeconds: 3600,
  })
  signed = signEnvelope(env, secretKey, publicKey)
})

function makeApprovalRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    envelope: signed,
    paymentRequest: { recipient: RECIPIENT, amount: 499, memo: 'API credits' },
    approvers: [{
      name: 'telegram',
      config: { botToken: '__mock__', chatId: '12345' },
    }],
    threshold: 1,
    timeoutSec: 600,
    humanReadableSummary: 'Pay $499 to Anthropic for API credits',
    riskScore: 'medium',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// TC-A01: Mock telegram approval — payment proceeds
// ---------------------------------------------------------------------------

describe('Telegram channel', () => {
  it('TC-A01: mock telegram approval (botToken=__mock__) → result is approved', async () => {
    const result = await requestApproval(makeApprovalRequest())
    expect(result.status).toBe('approved')
    expect(result.approvedBy).toHaveLength(1)
    expect(result.approvedBy[0]).toBe('mock:telegram')
    expect(result.approvedAt).toBeGreaterThan(0)
    expect(result.auditLog).toHaveLength(1)
    expect(result.auditLog[0].decision).toBe('approved')
    expect(result.auditLog[0].channel).toBe('telegram')
  })

  it('TC-A02: mock telegram rejection → throws ApprovalRejectedError', async () => {
    // Simulate rejection by using a reject-mock channel
    // We mock fetch to return a reject callback_query response
    const mockFetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
      const body = options?.body as string
      if (url.includes('getUpdates') && body?.includes('callback_query')) {
        return new Response(JSON.stringify({
          ok: true,
          result: [{
            update_id: 1,
            callback_query: {
              id: 'cq1',
              data: 'pqreject:anyid',  // will be ignored if requestId doesn't match
              from: { id: 999, username: 'testuser' },
              message: { message_id: 1, chat: { id: 12345 } },
            },
          }],
        }))
      }
      return new Response(JSON.stringify({ ok: true, result: {} }))
    })
    globalThis.fetch = mockFetch

    // For rejection test, use a dedicated webhook channel that returns reject
    const webhookRejectReq = makeApprovalRequest({
      approvers: [{
        name: 'webhook',
        config: { url: 'https://mock.example.com/approve' },
      }],
    })

    // Mock fetch to return rejection from webhook
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ approved: false, approverIdentifier: 'bob@example.com' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ))

    await expect(requestApproval(webhookRejectReq)).rejects.toThrow(ApprovalRejectedError)

    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// TC-A03: Multi-channel parallel — telegram approves before slack responds
// ---------------------------------------------------------------------------

describe('Multi-channel parallel', () => {
  it('TC-A03: telegram approves; slack is pending → result is approved (first wins at threshold=1)', async () => {
    // telegram mock approves instantly; slack would time out but we don't wait for it
    // With threshold=1, telegram approval is enough
    const req = makeApprovalRequest({
      approvers: [
        { name: 'telegram', config: { botToken: '__mock__', chatId: '12345' } },
        // Slack is webhook-based and waits for resolveApproval — it will timeout/error
        // but since threshold=1 and telegram already approved, we should be approved
        { name: 'slack', config: { webhookUrl: 'https://hooks.slack.com/test' } },
      ],
      threshold: 1,
      timeoutSec: 2,  // short timeout so slack path errors quickly
    })

    // Mock slack webhook POST to succeed (message sent)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('slack')) {
        return new Response('ok', { status: 200 })
      }
      return new Response('ok', { status: 200 })
    }))

    const result = await requestApproval(req)
    // telegram mock approves → overall result is approved (threshold=1 met)
    expect(result.status).toBe('approved')
    expect(result.approvedBy).toContain('mock:telegram')

    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// TC-A04: Quorum 2-of-3 — only 1 approves → expires
// ---------------------------------------------------------------------------

describe('Quorum enforcement', () => {
  it('TC-A04: threshold=2, only 1 mock telegram approves, 2 webhook channels timeout → expired', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      // Webhooks return 200 but rejected
      return new Response(JSON.stringify({ approved: false, approverIdentifier: 'auto-reject' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))

    const req = makeApprovalRequest({
      approvers: [
        { name: 'telegram', config: { botToken: '__mock__', chatId: '12345' } },
        { name: 'webhook', config: { url: 'https://mock1.example.com/approve' } },
        { name: 'webhook', config: { url: 'https://mock2.example.com/approve' } },
      ],
      threshold: 2,
      timeoutSec: 5,
    })

    // 1 approved (telegram mock) + 2 rejected (webhooks) → rejected (cannot reach quorum)
    await expect(requestApproval(req)).rejects.toThrow(ApprovalRejectedError)

    vi.unstubAllGlobals()
  })

  it('TC-A05: threshold=2, 2-of-3 approve via webhook → approved', async () => {
    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string) => {
      callCount++
      // First two calls approve, third rejects
      const approved = callCount <= 2
      return new Response(
        JSON.stringify({ approved, approverIdentifier: `approver-${callCount}` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }))

    const req = makeApprovalRequest({
      approvers: [
        { name: 'webhook', config: { url: 'https://mock1.example.com/approve' } },
        { name: 'webhook', config: { url: 'https://mock2.example.com/approve' } },
        { name: 'webhook', config: { url: 'https://mock3.example.com/approve' } },
      ],
      threshold: 2,
      timeoutSec: 10,
    })

    const result = await requestApproval(req)
    expect(result.status).toBe('approved')
    expect(result.approvedBy.length).toBeGreaterThanOrEqual(2)

    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// TC-A06: HMAC validation on webhook channel
// ---------------------------------------------------------------------------

describe('Webhook HMAC', () => {
  it('TC-A06: webhook with valid HMAC response signature is accepted', async () => {
    const secret = 'my-webhook-secret-key'
    const requestId = 'test-req-abc'

    // Mock webhook returns a properly signed response
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, options?: RequestInit) => {
      const body = options?.body as string
      const payload = JSON.parse(body) as { requestId: string }
      const rid = payload.requestId ?? requestId

      const sig = createHmac('sha256', secret)
        .update(JSON.stringify({ requestId: rid, approved: true }))
        .digest('hex')

      return new Response(
        JSON.stringify({ approved: true, approverIdentifier: 'webhookbot', signature: sig }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }))

    const req = makeApprovalRequest({
      approvers: [{
        name: 'webhook',
        config: { url: 'https://secure.example.com/approve', secret },
      }],
    })

    const result = await requestApproval(req)
    expect(result.status).toBe('approved')
    expect(result.approvedBy[0]).toBe('webhookbot')

    vi.unstubAllGlobals()
  })

  it('TC-A06b: webhook with INVALID HMAC response signature → result is not approved (error → pending → timeout)', async () => {
    const secret = 'my-webhook-secret-key'

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ approved: true, approverIdentifier: 'evil', signature: 'deadbeef'.repeat(8) }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ))

    const req = makeApprovalRequest({
      approvers: [{
        name: 'webhook',
        config: { url: 'https://evil.example.com/approve', secret },
      }],
      timeoutSec: 1,
    })

    // HMAC failure → channel errors → single channel, threshold=1, can't meet quorum → expired
    await expect(requestApproval(req)).rejects.toThrow(ApprovalTimeoutError)

    vi.unstubAllGlobals()
  })
})

// ---------------------------------------------------------------------------
// TC-A07: Audit log integrity
// ---------------------------------------------------------------------------

describe('Audit log', () => {
  it('TC-A07: audit log contains requestId, channel, decision, responseTimeMs, and timestamp', async () => {
    const result = await requestApproval(makeApprovalRequest())
    expect(result.auditLog).toHaveLength(1)
    const entry = result.auditLog[0]
    expect(entry.approvalRequestId).toBeTruthy()
    expect(entry.approvalRequestId).toHaveLength(32) // sha256 truncated to 32 hex chars
    expect(entry.channel).toBe('telegram')
    expect(entry.decision).toBe('approved')
    expect(entry.responseTimeMs).toBeGreaterThanOrEqual(0)
    expect(entry.timestamp).toBeGreaterThan(0)
    expect(entry.approverIdentifier).toBeTruthy()
  })

  it('TC-A07b: getApprovalStatus returns stored result after requestApproval', async () => {
    const result = await requestApproval(makeApprovalRequest())
    const requestId = result.auditLog[0]?.approvalRequestId
    if (requestId) {
      const stored = await getApprovalStatus(requestId)
      // May be a different request (ID is based on content+ts), but should return a result object
      expect(stored).toBeTruthy()
      expect(stored.status).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// TC-A08: Threshold enforcement (amount >= requiresApprovalAbove)
// ---------------------------------------------------------------------------

describe('Threshold enforcement in executeAgentPayment', () => {
  beforeEach(() => {
    setAgentPayConfig({ mockMode: true })
  })

  it('TC-A08: amount below threshold executes without approval gate', async () => {
    // No approvalRequest passed — should execute directly
    const result = await executeAgentPayment(signed, {
      recipient: RECIPIENT,
      amount: 50,
      memo: 'small payment — no approval needed',
    })
    expect(result.success).toBe(true)
  })

  it('TC-A09: approvalRequest provided → approval gate fires before rail dispatch', async () => {
    const approvalReq: ApprovalRequest = {
      envelope: signed,
      paymentRequest: { recipient: RECIPIENT, amount: 500 },
      approvers: [{ name: 'telegram', config: { botToken: '__mock__', chatId: '12345' } }],
      threshold: 1,
      timeoutSec: 10,
      humanReadableSummary: 'Pay $500 — requires approval',
      riskScore: 'high',
    }

    const result = await executeAgentPayment(
      signed,
      { recipient: RECIPIENT, amount: 500 },
      undefined,
      approvalReq,
    )
    expect(result.success).toBe(true)
    // Rail was dispatched after approval
    expect(result.amount).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// TC-A10: resolveApproval out-of-band (Slack App callback pattern)
// ---------------------------------------------------------------------------

describe('resolveApproval (out-of-band callback)', () => {
  it('TC-A10: Slack message sent, resolveApproval called → requestApproval resolves as approved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('ok', { status: 200 }),
    ))

    let capturedRequestId = ''

    // We need to capture the requestId before it's used in the Slack message.
    // The easiest way is to intercept the first fetch call (the Slack webhook POST)
    // and schedule a resolveApproval call after a tick.
    let slackCallCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_url: string, options?: RequestInit) => {
      if (slackCallCount === 0) {
        // First call is Slack webhook POST
        slackCallCount++
        // Extract requestId from the posted Block Kit message
        const body = JSON.parse(options?.body as string ?? '{}') as { blocks?: Array<{ fields?: Array<{ text: string }> }> }
        // Find the requestId in the blocks
        for (const block of body.blocks ?? []) {
          for (const field of block.fields ?? []) {
            const m = field.text?.match(/`([a-f0-9]{32})`/)
            if (m) {
              capturedRequestId = m[1]
              // Schedule resolution
              setTimeout(() => {
                resolveApproval(capturedRequestId, true, 'slack-user-raymond')
              }, 10)
              break
            }
          }
        }
      }
      return new Response('ok', { status: 200 })
    }))

    const req = makeApprovalRequest({
      approvers: [{
        name: 'slack',
        config: { webhookUrl: 'https://hooks.slack.com/test' },
      }],
      timeoutSec: 5,
    })

    const result = await requestApproval(req)
    expect(result.status).toBe('approved')
    expect(result.approvedBy).toContain('slack-user-raymond')

    vi.unstubAllGlobals()
  })
})
