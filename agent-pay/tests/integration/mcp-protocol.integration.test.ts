/**
 * MCP protocol integration test (Vitest)
 *
 * Tests the MCP protocol handler for PQSafe payments.
 * No secrets required — uses mock mode throughout.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createEnvelope, signEnvelope, verifyEnvelope, setAgentPayConfig } from '../../src/index.js'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import type { SignedEnvelope } from '../../src/types.js'

function freshKeypair() {
  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const address = 'pq1' + bytesToHex(keccak_256(publicKey).slice(0, 20))
  return { publicKey, secretKey, address }
}

// Simulate an MCP tool call payload
interface McpToolCall {
  tool: string
  params: Record<string, unknown>
}

interface McpToolResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

/**
 * Simulated MCP handler that processes PQSafe payment tool calls.
 * In production this would be wired to the real MCP server.
 */
async function handleMcpToolCall(
  call: McpToolCall,
  signedEnvelope: SignedEnvelope,
): Promise<McpToolResult> {
  const { executeAgentPayment } = await import('../../src/index.js')

  switch (call.tool) {
    case 'pqsafe_pay': {
      const { recipient, amount, memo } = call.params as {
        recipient: string
        amount: number
        memo?: string
      }
      try {
        const result = await executeAgentPayment(signedEnvelope, { recipient, amount, memo })
        return { success: true, data: { txId: result.txId, rail: result.rail, amount: result.amount } }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
      }
    }

    case 'pqsafe_verify': {
      try {
        const verified = verifyEnvelope(signedEnvelope)
        return {
          success: true,
          data: {
            issuer: verified.issuer,
            maxAmount: verified.maxAmount,
            currency: verified.currency,
            rail: verified.rail,
          },
        }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) }
      }
    }

    default:
      return { success: false, error: `Unknown tool: ${call.tool}` }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP protocol integration', () => {
  let signedEnvelope: SignedEnvelope
  const GOOD_RECIPIENT = 'GB29NWBK60161331926819'

  beforeAll(() => {
    setAgentPayConfig({ mockMode: true })

    const { address, secretKey, publicKey } = freshKeypair()
    const envelope = createEnvelope({
      issuer: address,
      agent: 'mcp-integration-test-agent',
      maxAmount: 200,
      currency: 'USD',
      allowedRecipients: [GOOD_RECIPIENT, 'in_test_invoice001'],
      ttlSeconds: 3600,
      rail: 'airwallex',
    })
    signedEnvelope = signEnvelope(envelope, secretKey, publicKey)
  })

  afterAll(() => {
    setAgentPayConfig({ mockMode: false })
  })

  it('pqsafe_verify tool returns envelope metadata', async () => {
    const result = await handleMcpToolCall({ tool: 'pqsafe_verify', params: {} }, signedEnvelope)
    expect(result.success).toBe(true)
    expect(result.data?.maxAmount).toBe(200)
    expect(result.data?.currency).toBe('USD')
    expect(typeof result.data?.issuer).toBe('string')
  })

  it('pqsafe_pay tool executes in-policy payment', async () => {
    const result = await handleMcpToolCall(
      {
        tool: 'pqsafe_pay',
        params: { recipient: GOOD_RECIPIENT, amount: 50, memo: 'MCP test payment' },
      },
      signedEnvelope,
    )
    expect(result.success).toBe(true)
    expect(typeof result.data?.txId).toBe('string')
    expect(result.data?.amount).toBe(50)
  })

  it('pqsafe_pay tool returns error for over-ceiling amount', async () => {
    const result = await handleMcpToolCall(
      { tool: 'pqsafe_pay', params: { recipient: GOOD_RECIPIENT, amount: 201 } },
      signedEnvelope,
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/exceeds envelope maxAmount/)
  })

  it('pqsafe_pay tool returns error for unlisted recipient', async () => {
    const result = await handleMcpToolCall(
      { tool: 'pqsafe_pay', params: { recipient: 'ATTACKER', amount: 10 } },
      signedEnvelope,
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not in the envelope allowlist/)
  })

  it('unknown tool returns clean error', async () => {
    const result = await handleMcpToolCall(
      { tool: 'pqsafe_drain_all', params: {} },
      signedEnvelope,
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown tool')
  })

  it('tampered envelope is rejected by pqsafe_verify', async () => {
    const tampered: SignedEnvelope = {
      ...signedEnvelope,
      envelopeJson: signedEnvelope.envelopeJson.replace('"maxAmount":200', '"maxAmount":999999'),
    }
    const result = await handleMcpToolCall({ tool: 'pqsafe_verify', params: {} }, tampered)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/verification failed/)
  })
})
