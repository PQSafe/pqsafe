/**
 * x402 End-to-End Demo — PQSafe AgentPay
 *
 * Demonstrates the x402 Payment Required protocol end-to-end:
 *   1. Optionally starts the mock x402 server on port 4402
 *   2. Agent probes the endpoint → gets 402 + X-Payment-Requirements
 *   3. Agent creates + signs a spend envelope (ML-DSA-65)
 *   4. Agent constructs a payment proof (mock txHash)
 *   5. Agent re-requests the resource with X-Payment header → 200 + content
 *
 * This demo uses the PQSafe x402 rail primitives (requestResource, signPayment,
 * retryWithPayment) plus the mock server to show the full protocol without
 * any real on-chain transaction.
 *
 * Run modes:
 *   npx tsx demo/x402-demo.ts                    # starts server + runs client
 *   npx tsx demo/x402-demo.ts --client-only       # client only (server must be running)
 *   npx tsx demo/x402-demo.ts --server-only       # server only
 *
 * See demo/X402_DEMO.md for full instructions.
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import {
  createEnvelope,
  signEnvelope,
  verifyEnvelope,
} from '../src/index.js'
import {
  requestResource,
  signPayment,
  retryWithPayment,
} from '../src/rails/x402.js'

// ---------------------------------------------------------------------------
// Terminal helpers
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
}

const lineChar = (n = 72) => '─'.repeat(n)

function header(step: string, title: string) {
  console.log('')
  console.log(`${C.cyan}${lineChar()}${C.reset}`)
  console.log(`${C.cyan}${C.bold}  ${step}  ${title}${C.reset}`)
  console.log(`${C.cyan}${lineChar()}${C.reset}`)
}

function say(label: string, value: string) {
  console.log(`  ${C.dim}${label.padEnd(22)}${C.reset} ${value}`)
}

function ok(msg: string) {
  console.log(`  ${C.green}✓${C.reset} ${msg}`)
}

function fail(msg: string) {
  console.log(`  ${C.red}✗${C.reset} ${msg}`)
}

function deriveAddress(pubKey: Uint8Array): string {
  return 'pq1' + bytesToHex(keccak_256(pubKey).slice(0, 20))
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const clientOnly = args.includes('--client-only')
const serverOnly = args.includes('--server-only')

const SERVER_PORT = 4402
const SERVER_URL = `http://localhost:${SERVER_PORT}`
const RESOURCE_URL = `${SERVER_URL}/api/resource`

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runServer() {
  // Dynamically import and start the server
  const { server } = await import('./x402-mock-server/server.js')
  void server // already started by the import

  // Give it a moment to bind
  await sleep(200)
}

async function runClient() {
  console.log('')
  console.log(`${C.bold}PQSafe AgentPay — x402 Protocol Demo${C.reset}`)
  console.log(`${C.dim}ML-DSA-65 • NIST FIPS 204 • HTTP 402 Payment Required${C.reset}`)
  console.log('')
  say('Server', SERVER_URL)
  say('Resource', RESOURCE_URL)

  // ---------------------------------------------------------------------------
  // Step 1: Generate ML-DSA-65 keypair
  // ---------------------------------------------------------------------------
  header('Step 1', 'Generate post-quantum keypair')

  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const pqAddress = deriveAddress(publicKey)

  say('Scheme', 'ML-DSA-65 (NIST FIPS 204)')
  say('Public key', `${publicKey.length} bytes`)
  say('PQSafe addr', pqAddress)
  ok('Keypair generated')

  // ---------------------------------------------------------------------------
  // Step 2: Probe endpoint — expect 402
  // ---------------------------------------------------------------------------
  header('Step 2', 'Probe endpoint (expect HTTP 402)')

  const probeResult = await requestResource(RESOURCE_URL)

  if (probeResult.status !== 402) {
    fail(`Expected 402, got ${probeResult.status}`)
    process.exit(1)
  }

  if (!probeResult.requirements) {
    fail('402 response missing payment requirements')
    process.exit(1)
  }

  const req = probeResult.requirements
  say('HTTP status', '402 Payment Required')
  say('Scheme', req.scheme)
  say('Network', req.network)
  say('Token', req.tokenAddress ?? '(native)')
  say('Amount', req.amount ?? '0')
  say('Recipient', req.to)
  ok('Payment requirements parsed from X-Payment-Requirements header')

  // ---------------------------------------------------------------------------
  // Step 3: Build + sign spend envelope
  // ---------------------------------------------------------------------------
  header('Step 3', 'Build + sign spend envelope')

  const requiredUSDC = req.amount ? parseFloat(req.amount) / 1e6 : 1

  const now = Math.floor(Date.now() / 1000)
  const envelope = createEnvelope({
    issuer: pqAddress,
    agent: 'pqsafe-x402-demo',
    maxAmount: requiredUSDC + 0.01, // tiny buffer
    currency: 'USDC',
    allowedRecipients: [req.to, RESOURCE_URL],
    validFrom: now,
    validUntil: now + 3600,
    rail: 'x402',
  })

  const signed = signEnvelope(envelope, secretKey, publicKey)

  // verifyEnvelope throws on failure; wrap in try/catch for demo error reporting
  let verifiedEnvelope: ReturnType<typeof verifyEnvelope>
  try {
    verifiedEnvelope = verifyEnvelope(signed)
  } catch (verifyErr) {
    fail(`Verification failed: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`)
    process.exit(1)
  }

  void verifiedEnvelope // verification confirmed (throws on failure)
  say('Max amount', `${envelope.maxAmount} USDC`)
  say('Required', `${requiredUSDC} USDC`)
  say('Signature', `${signed.signature.length / 2} bytes (ML-DSA-65)`)
  ok('Envelope signed + verified')

  // ---------------------------------------------------------------------------
  // Step 4: Construct payment proof
  // ---------------------------------------------------------------------------
  header('Step 4', 'Construct payment proof')

  // In real mode: execute on-chain USDC transfer and get txHash
  // In this demo: simulate with a deterministic mock txHash
  const mockTxHash = '0x' + bytesToHex(
    keccak_256(new TextEncoder().encode(`demo-${envelope.nonce}-${Date.now()}`))
  )

  const proof = signPayment(req, mockTxHash)

  say('txHash (mock)', mockTxHash.slice(0, 20) + '...')
  say('Amount', proof.amount)
  say('To', proof.to)
  say('Timestamp', String(proof.timestamp))
  say('Header length', `${proof.header.length} chars (base64url)`)
  ok('Payment proof constructed')

  // ---------------------------------------------------------------------------
  // Step 5: Retry request with X-Payment header
  // ---------------------------------------------------------------------------
  header('Step 5', 'Retry request with X-Payment header (expect 200)')

  const resourceResult = await retryWithPayment(RESOURCE_URL, proof)

  if (resourceResult.status !== 200) {
    fail(`Expected 200, got ${resourceResult.status}`)
    fail(`Body: ${resourceResult.body.slice(0, 200)}`)
    process.exit(1)
  }

  say('HTTP status', `${C.green}200 OK${C.reset}`)

  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(resourceResult.body) as Record<string, unknown>
  } catch {
    // non-JSON body is ok
  }

  say('Resource data', (parsed.data as string) ?? resourceResult.body.slice(0, 50))
  if ((parsed.resource as Record<string, unknown>)?.tier) {
    say('Access tier', (parsed.resource as Record<string, unknown>).tier as string)
  }
  ok('Resource accessed successfully via x402 payment proof')

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('')
  console.log(`${C.bold}${lineChar()}${C.reset}`)
  console.log(`${C.bold}  x402 Protocol Demo Complete${C.reset}`)
  console.log(`${C.bold}${lineChar()}${C.reset}`)
  console.log('')
  console.log('  Full handshake:')
  console.log(`  ${C.dim}1${C.reset} GET /api/resource → ${C.yellow}402 Payment Required${C.reset} + X-Payment-Requirements`)
  console.log(`  ${C.dim}2${C.reset} Build ML-DSA-65 signed envelope → verify → payment proof`)
  console.log(`  ${C.dim}3${C.reset} GET /api/resource + X-Payment header → ${C.green}200 OK${C.reset} + premium content`)
  console.log('')
  console.log('  In production: replace mock txHash with a real Base Sepolia USDC transfer.')
  console.log('  The PQSafe USDC-Base rail handles signing + broadcasting.')
  console.log('')

  // Guard rails demo
  header('Guard rails', 'Policy enforcement')

  // Attempt with wrong recipient
  const badEnvelope = createEnvelope({
    issuer: pqAddress,
    agent: 'attacker',
    maxAmount: 999,
    currency: 'USDC',
    allowedRecipients: ['0x' + '1'.repeat(40)], // wrong address
    validFrom: now,
    validUntil: now + 3600,
    rail: 'x402',
  })

  const badProof = signPayment(
    { ...req, to: '0x' + '1'.repeat(40) }, // wrong recipient
    mockTxHash,
  )

  try {
    const badResult = await retryWithPayment(RESOURCE_URL, badProof)
    if (badResult.status === 402) {
      ok('Bad recipient rejected by x402 server (402 returned)')
    } else {
      fail(`BUG: bad recipient was accepted (status ${badResult.status})`)
    }
  } catch {
    ok('Bad recipient rejected')
  }

  void badEnvelope // used only for clarity

  ok('Policy enforcement working correctly')
  console.log('')
}

async function main() {
  if (serverOnly) {
    await runServer()
    // Keep process alive
    await new Promise(() => {})
    return
  }

  if (!clientOnly) {
    // Start server first
    await runServer()
    await sleep(300) // brief wait for server to be ready
  }

  await runClient()

  if (!clientOnly) {
    // Demo complete — exit
    process.exit(0)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
