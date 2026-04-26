/**
 * integration.test.ts — MCP server integration test
 *
 * Spins up the PQSafe MCP server as a child process over stdio transport,
 * sends 3 mock tool calls (create / verify / execute), and asserts
 * all responses include the expected fields.
 *
 * All in mock mode — no real API keys or network calls required.
 *
 * Run:
 *   npx tsx test/integration.test.ts
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { createEnvelope, signEnvelope } from '@pqsafe/agent-pay'

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const failures: Array<{ name: string; err: string }> = []

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } catch (err) {
    failed++
    const msg = err instanceof Error ? err.message : String(err)
    failures.push({ name, err: msg })
    console.log(`  \x1b[31m✗\x1b[0m ${name}`)
    console.log(`    \x1b[90m${msg}\x1b[0m`)
  }
}

// ---------------------------------------------------------------------------
// MCP client (minimal JSON-RPC over stdio)
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_PATH = join(__dirname, '..', 'dist', 'server.js')

interface McpResponse {
  jsonrpc: string
  id: number
  result?: { content: Array<{ type: string; text: string }>; isError?: boolean }
  error?: { code: number; message: string }
}

class McpTestClient {
  private proc: ReturnType<typeof spawn>
  private buffer = ''
  private pending = new Map<number, (resp: McpResponse) => void>()
  private idCounter = 0

  constructor() {
    this.proc = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString()
      // JSON-RPC messages are newline-delimited
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as McpResponse
          const resolve = this.pending.get(msg.id)
          if (resolve) {
            this.pending.delete(msg.id)
            resolve(msg)
          }
        } catch {
          // skip malformed lines
        }
      }
    })

    this.proc.stderr!.on('data', (_chunk: Buffer) => {
      // MCP servers write startup info to stderr — ignore
    })
  }

  private send(method: string, params: unknown): Promise<McpResponse> {
    return new Promise((resolve, reject) => {
      const id = ++this.idCounter
      this.pending.set(id, resolve)
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
      this.proc.stdin!.write(msg)

      // 10s timeout per call
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`MCP call timed out: ${method}`))
        }
      }, 10_000)
    })
  }

  async initialize(): Promise<void> {
    await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'pqsafe-integration-test', version: '0.1.0' },
    })
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpResponse> {
    return this.send('tools/call', { name, arguments: args })
  }

  close(): void {
    this.proc.kill()
  }
}

// ---------------------------------------------------------------------------
// Pre-generate a valid signed envelope for the tests
// ---------------------------------------------------------------------------

const dsaSeed = globalThis.crypto.getRandomValues(new Uint8Array(32))
const { publicKey: dsaPublicKey, secretKey: dsaSecretKey } = ml_dsa65.keygen(dsaSeed)
const issuerAddress = 'pq1' + bytesToHex(keccak_256(dsaPublicKey).slice(0, 20))

const testEnvelope = createEnvelope({
  issuer: issuerAddress,
  agent: 'mcp-integration-test-agent',
  maxAmount: 500,
  currency: 'USD',
  allowedRecipients: ['anthropic.com/billing', 'test.recipient'],
  ttlSeconds: 3600,
  rail: 'stripe',
})
const signedEnvelope = signEnvelope(testEnvelope, dsaSecretKey, dsaPublicKey)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\x1b[1m\x1b[35m  PQSafe MCP — Integration Test Suite\x1b[0m')
console.log('\x1b[90m  stdio transport · mock mode · 3 tool calls\x1b[0m')
console.log()

const client = new McpTestClient()

try {
  // Allow server to start
  await new Promise<void>(r => setTimeout(r, 500))
  await client.initialize()

  // -------------------------------------------------------------------------
  // Test 1: pqsafe.create_envelope — mock mode (no secret key provided)
  // -------------------------------------------------------------------------
  await test('create_envelope returns signedEnvelope with expected fields (mock keypair)', async () => {
    const resp = await client.callTool('pqsafe.create_envelope', {
      agent: 'mcp-test-agent',
      max_amount: 100,
      currency: 'USD',
      allowed_recipients: ['anthropic.com/billing'],
      ttl_seconds: 3600,
    })

    assert(!resp.error, `RPC error: ${JSON.stringify(resp.error)}`)
    assert(resp.result, 'Expected result')
    assert(!resp.result.isError, `Tool error: ${resp.result.content[0]?.text}`)
    assert(resp.result.content.length > 0, 'No content in response')

    const data = JSON.parse(resp.result.content[0].text) as {
      success: boolean
      signedEnvelope: { envelopeJson: string; signature: string; dsaPublicKey: string }
      envelopeFields: { maxAmount: number; currency: string }
    }

    assert(data.success === true, 'Expected success=true')
    assert(typeof data.signedEnvelope === 'object', 'Expected signedEnvelope object')
    assert(typeof data.signedEnvelope.envelopeJson === 'string', 'Expected envelopeJson string')
    assert(typeof data.signedEnvelope.signature === 'string', 'Expected signature string')
    assert(data.signedEnvelope.signature.length > 0, 'signature must not be empty')
    assert(typeof data.signedEnvelope.dsaPublicKey === 'string', 'Expected dsaPublicKey string')
    assert(data.envelopeFields.maxAmount === 100, `Expected maxAmount=100, got ${data.envelopeFields.maxAmount}`)
    assert(data.envelopeFields.currency === 'USD', `Expected USD, got ${data.envelopeFields.currency}`)
  })

  // -------------------------------------------------------------------------
  // Test 2: pqsafe.verify_envelope — with a valid pre-signed envelope
  // -------------------------------------------------------------------------
  await test('verify_envelope returns valid=true for a correctly signed envelope', async () => {
    const resp = await client.callTool('pqsafe.verify_envelope', {
      envelope_json: signedEnvelope.envelopeJson,
      signature: signedEnvelope.signature,
      dsa_public_key: signedEnvelope.dsaPublicKey,
    })

    assert(!resp.error, `RPC error: ${JSON.stringify(resp.error)}`)
    assert(resp.result, 'Expected result')
    assert(!resp.result.isError, `Tool error: ${resp.result.content[0]?.text}`)

    const data = JSON.parse(resp.result.content[0].text) as {
      valid: boolean
      envelope: { maxAmount: number; currency: string; allowedRecipients: string[] }
    }

    assert(data.valid === true, `Expected valid=true, got ${data.valid}`)
    assert(data.envelope.maxAmount === 500, `Expected maxAmount=500, got ${data.envelope.maxAmount}`)
    assert(data.envelope.currency === 'USD', `Expected USD, got ${data.envelope.currency}`)
    assert(
      data.envelope.allowedRecipients.includes('anthropic.com/billing'),
      'Expected anthropic.com/billing in allowedRecipients',
    )
  })

  // -------------------------------------------------------------------------
  // Test 3: pqsafe.execute_payment — mock mode
  // -------------------------------------------------------------------------
  await test('execute_payment returns txId and success=true in mock mode', async () => {
    const resp = await client.callTool('pqsafe.execute_payment', {
      envelope_json: signedEnvelope.envelopeJson,
      signature: signedEnvelope.signature,
      dsa_public_key: signedEnvelope.dsaPublicKey,
      recipient: 'anthropic.com/billing',
      amount: 49.99,
      memo: 'MCP integration test — April 2026',
      mock_mode: true,
    })

    assert(!resp.error, `RPC error: ${JSON.stringify(resp.error)}`)
    assert(resp.result, 'Expected result')
    assert(!resp.result.isError, `Tool error: ${resp.result.content[0]?.text}`)

    const data = JSON.parse(resp.result.content[0].text) as {
      success: boolean
      txId: string
      rail: string
      amount: number
      currency: string
      recipient: string
      mockMode: boolean
    }

    assert(data.success === true, `Expected success=true, got ${data.success}`)
    assert(typeof data.txId === 'string', 'Expected txId string')
    assert(data.txId.startsWith('mock_'), `Expected mock_ prefix, got ${data.txId}`)
    assert(data.amount === 49.99, `Expected amount=49.99, got ${data.amount}`)
    assert(data.currency === 'USD', `Expected USD, got ${data.currency}`)
    assert(data.recipient === 'anthropic.com/billing', `Unexpected recipient: ${data.recipient}`)
    assert(data.mockMode === true, 'Expected mockMode=true')
  })

  // -------------------------------------------------------------------------
  // Test 4: execute_payment — blocked recipient raises error
  // -------------------------------------------------------------------------
  await test('execute_payment rejects payment to blocked recipient', async () => {
    const resp = await client.callTool('pqsafe.execute_payment', {
      envelope_json: signedEnvelope.envelopeJson,
      signature: signedEnvelope.signature,
      dsa_public_key: signedEnvelope.dsaPublicKey,
      recipient: 'evil.com/steal',
      amount: 1.0,
      mock_mode: true,
    })

    assert(!resp.error, `Unexpected RPC error: ${JSON.stringify(resp.error)}`)
    assert(resp.result?.isError === true, 'Expected isError=true for blocked recipient')
    const text = resp.result.content[0]?.text ?? ''
    assert(
      text.includes('evil.com/steal') || text.includes('not in allowlist') || text.includes('allowedRecipients'),
      `Expected allowlist error, got: ${text}`,
    )
  })

} finally {
  client.close()
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log()
console.log(`  \x1b[1m${passed + failed} tests · ${passed} passed · ${failed} failed\x1b[0m`)
if (failures.length > 0) {
  console.log()
  console.log('  Failures:')
  for (const f of failures) {
    console.log(`    \x1b[31m✗\x1b[0m ${f.name}: ${f.err}`)
  }
  process.exit(1)
} else {
  console.log(`  \x1b[32mAll MCP integration tests passed.\x1b[0m`)
}
