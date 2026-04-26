/**
 * x402 Mock Server — PQSafe AgentPay
 *
 * A minimal Express server that implements the x402 Payment Required protocol.
 *
 * Endpoints:
 *   GET /api/resource         — requires payment (returns 402 + payment requirements)
 *   GET /api/free             — no payment required (returns 200)
 *   GET /api/status           — server status (returns 200)
 *
 * Payment flow:
 *   1. Client GETs /api/resource without X-Payment header → 402 + X-Payment-Requirements
 *   2. Client constructs payment proof (txHash + amount + recipient)
 *   3. Client re-GETs /api/resource with X-Payment header → 200 + resource body
 *
 * The X-Payment-Requirements header is base64url-encoded JSON conforming to x402.org spec.
 * The X-Payment header is base64url-encoded JSON payment proof.
 *
 * Run:
 *   cd ~/Projects/pqsafe/agent-pay
 *   npx tsx demo/x402-mock-server/server.ts
 *
 * Or run both server + client demo:
 *   npx tsx demo/x402-demo.ts
 */

import { createServer } from 'http'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.X402_PORT ? parseInt(process.env.X402_PORT) : 4402
const PAYMENT_RECIPIENT = '0x' + 'f'.repeat(40) // mock recipient address
const PAYMENT_AMOUNT_USDC = '1000000' // 1 USDC (6 decimals)
const CHAIN = 'base-sepolia'
const USDC_CONTRACT = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

// ---------------------------------------------------------------------------
// x402 helpers
// ---------------------------------------------------------------------------

interface PaymentRequirements {
  scheme: string
  network: string
  tokenAddress: string
  amount: string
  to: string
  maxTimeoutSeconds: number
  description: string
}

interface PaymentProof {
  scheme: string
  txHash: string
  amount: string
  to: string
  timestamp: number
}

function buildPaymentRequirements(): PaymentRequirements {
  return {
    scheme: 'exact',
    network: CHAIN,
    tokenAddress: USDC_CONTRACT,
    amount: PAYMENT_AMOUNT_USDC,
    to: PAYMENT_RECIPIENT,
    maxTimeoutSeconds: 300,
    description: 'Access to PQSafe premium API resource — 1 USDC',
  }
}

function encodeBase64url(data: unknown): string {
  const json = JSON.stringify(data)
  return Buffer.from(json).toString('base64url')
}

function decodeBase64url(b64: string): unknown {
  const json = Buffer.from(b64, 'base64url').toString('utf8')
  return JSON.parse(json)
}

function validatePaymentProof(header: string): { valid: boolean; error?: string; proof?: PaymentProof } {
  let proof: PaymentProof
  try {
    proof = decodeBase64url(header) as PaymentProof
  } catch {
    return { valid: false, error: 'Invalid base64url encoding' }
  }

  if (!proof.txHash || typeof proof.txHash !== 'string') {
    return { valid: false, error: 'Missing txHash in payment proof' }
  }

  if (!proof.to || proof.to.toLowerCase() !== PAYMENT_RECIPIENT.toLowerCase()) {
    return { valid: false, error: `Payment to wrong recipient: ${proof.to}` }
  }

  if (!proof.amount || proof.amount !== PAYMENT_AMOUNT_USDC) {
    return { valid: false, error: `Incorrect payment amount: ${proof.amount}, expected ${PAYMENT_AMOUNT_USDC}` }
  }

  const now = Math.floor(Date.now() / 1000)
  if (proof.timestamp && now - proof.timestamp > 300) {
    return { valid: false, error: 'Payment proof expired (>300 seconds old)' }
  }

  return { valid: true, proof }
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

type Handler = (
  req: { url: string; method: string; headers: Record<string, string | string[] | undefined> },
  res: {
    writeHead: (status: number, headers?: Record<string, string>) => void
    end: (body?: string) => void
  }
) => void

const handler: Handler = (req, res) => {
  const url = req.url ?? '/'
  const method = req.method ?? 'GET'

  // CORS headers for browser testing
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Payment, X-Payment-TxHash, Content-Type',
  }

  if (method === 'OPTIONS') {
    res.writeHead(204, corsHeaders)
    res.end()
    return
  }

  // GET /api/status — health check
  if (url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders })
    res.end(JSON.stringify({
      status: 'ok',
      server: 'x402-mock-server',
      version: '1.0.0',
      chain: CHAIN,
      paymentRecipient: PAYMENT_RECIPIENT,
      paymentAmount: PAYMENT_AMOUNT_USDC,
      protocolSpec: 'https://x402.org',
    }, null, 2))
    return
  }

  // GET /api/free — no payment required
  if (url === '/api/free') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders })
    res.end(JSON.stringify({
      data: 'This resource is free — no payment required.',
      timestamp: new Date().toISOString(),
    }, null, 2))
    return
  }

  // GET /api/resource — x402 gated resource
  if (url === '/api/resource' || url.startsWith('/api/resource?')) {
    const reqHeaders = req.headers as Record<string, string | undefined>
    const paymentHeader = reqHeaders['x-payment'] ?? reqHeaders['X-Payment']

    // No payment header → return 402
    if (!paymentHeader) {
      const requirements = buildPaymentRequirements()
      const encodedReq = encodeBase64url(requirements)

      res.writeHead(402, {
        'Content-Type': 'application/json',
        'X-Payment-Requirements': encodedReq,
        'X-Payment-Requirements-Version': '1',
        ...corsHeaders,
      })
      res.end(JSON.stringify({
        error: 'payment_required',
        message: 'This resource requires payment. Include X-Payment header with proof.',
        requirements,
        instructions: [
          '1. Decode X-Payment-Requirements header (base64url → JSON)',
          '2. Execute USDC transfer to requirements.to for requirements.amount',
          '3. Re-request with X-Payment header: base64url({ scheme, txHash, amount, to, timestamp })',
        ],
      }, null, 2))
      return
    }

    // Has payment header → validate
    const validation = validatePaymentProof(paymentHeader)

    if (!validation.valid) {
      res.writeHead(402, { 'Content-Type': 'application/json', ...corsHeaders })
      res.end(JSON.stringify({
        error: 'payment_invalid',
        message: validation.error,
      }, null, 2))
      return
    }

    // Payment valid → return resource
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders })
    res.end(JSON.stringify({
      data: 'premium_content',
      message: 'Payment verified. Welcome to the premium resource.',
      resource: {
        id: 'pqsafe-demo-resource-001',
        content: 'This is gated content accessed via x402 Payment Required protocol.',
        tier: 'premium',
        accessedAt: new Date().toISOString(),
      },
      payment: {
        txHash: validation.proof!.txHash,
        amount: validation.proof!.amount,
        to: validation.proof!.to,
        verifiedAt: new Date().toISOString(),
      },
    }, null, 2))
    return
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json', ...corsHeaders })
  res.end(JSON.stringify({
    error: 'not_found',
    availableEndpoints: ['/api/resource', '/api/free', '/api/status'],
  }))
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const server = createServer(handler as any)

server.listen(PORT, () => {
  console.log('')
  console.log('  x402 Mock Server — PQSafe AgentPay')
  console.log('  ─────────────────────────────────────────────────────────')
  console.log(`  Listening on http://localhost:${PORT}`)
  console.log('')
  console.log('  Endpoints:')
  console.log(`    GET http://localhost:${PORT}/api/resource  — x402 gated (requires payment)`)
  console.log(`    GET http://localhost:${PORT}/api/free      — free resource (no payment)`)
  console.log(`    GET http://localhost:${PORT}/api/status    — server status`)
  console.log('')
  console.log('  Payment requirements:')
  console.log(`    Chain:     ${CHAIN}`)
  console.log(`    Token:     USDC (${USDC_CONTRACT})`)
  console.log(`    Amount:    ${PAYMENT_AMOUNT_USDC} (1 USDC, 6 decimals)`)
  console.log(`    Recipient: ${PAYMENT_RECIPIENT}`)
  console.log('')
  console.log('  Run the client demo in another terminal:')
  console.log('    npx tsx demo/x402-demo.ts --client-only')
  console.log('')
})

export { server, PORT, PAYMENT_RECIPIENT, PAYMENT_AMOUNT_USDC }
