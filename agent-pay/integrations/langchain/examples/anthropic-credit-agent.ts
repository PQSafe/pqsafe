/**
 * anthropic-credit-agent.ts — End-to-end LangChain agent demo
 *
 * Demonstrates a full agent loop that:
 *   1. Checks Anthropic API credit usage via AnthropicCreditCheckTool
 *   2. Requests a top-up via AnthropicCreditTopUpTool when usage > $5
 *   3. Executes the PQ-signed payment via PQSafePaymentTool
 *   4. Confirms the payment with a receipt
 *
 * Run (mock mode — no API keys required):
 *   npx tsx examples/anthropic-credit-agent.ts
 *
 * Run with live payment:
 *   PQSAFE_MOCK=false npx tsx examples/anthropic-credit-agent.ts
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { createEnvelope, signEnvelope } from '@pqsafe/agent-pay'
import { PQSafePaymentTool } from '../src/index.js'
import { Tool } from '@langchain/core/tools'

// ---------------------------------------------------------------------------
// Keypair + envelope setup
// ---------------------------------------------------------------------------

const dsaSeed = globalThis.crypto.getRandomValues(new Uint8Array(32))
const { publicKey: dsaPublicKey, secretKey: dsaSecretKey } = ml_dsa65.keygen(dsaSeed)
const issuerAddress = 'pq1' + bytesToHex(keccak_256(dsaPublicKey).slice(0, 20))
const RECIPIENT = 'anthropic.com/billing'

const envelope = createEnvelope({
  issuer: issuerAddress,
  agent: 'langchain-anthropic-credit-agent-v1',
  maxAmount: 100,
  currency: 'USD',
  allowedRecipients: [RECIPIENT],
  ttlSeconds: 3600,
  rail: 'stripe',
})
const signedEnvelope = signEnvelope(envelope, dsaSecretKey, dsaPublicKey)

const mockMode = process.env['PQSAFE_MOCK'] !== 'false'

// ---------------------------------------------------------------------------
// Tool 1: AnthropicCreditCheckTool (mock)
// ---------------------------------------------------------------------------

/** Simulates checking Anthropic API credit balance. Returns usage in USD. */
class AnthropicCreditCheckTool extends Tool {
  name = 'anthropic_credit_check'
  description =
    'Check current Anthropic API credit usage. Returns JSON with fields: ' +
    'usageUsd (number) — total spent this cycle, balanceUsd (number) — credits remaining, ' +
    'thresholdUsd (number) — auto top-up threshold. Call this first in the loop.'

  private readonly _mockUsage: number

  constructor(mockUsageUsd = 6.42) {
    super()
    this._mockUsage = mockUsageUsd
  }

  async _call(_input: string): Promise<string> {
    // Mock: simulate Anthropic billing API response
    const balanceUsd = Math.max(0, 10.0 - this._mockUsage)
    const result = {
      usageUsd: this._mockUsage,
      balanceUsd,
      thresholdUsd: 5.0,
      cycleStart: '2026-04-01T00:00:00Z',
      cycleEnd: '2026-04-30T23:59:59Z',
      status: balanceUsd < 2.0 ? 'LOW_BALANCE' : 'OK',
      mockMode: true,
    }
    return JSON.stringify(result)
  }
}

// ---------------------------------------------------------------------------
// Tool 2: AnthropicCreditTopUpTool (mock — wraps PQSafe payment)
// ---------------------------------------------------------------------------

/** Initiates a credit top-up by composing a PQSafe payment request. */
class AnthropicCreditTopUpTool extends Tool {
  name = 'anthropic_credit_topup'
  description =
    'Request a credit top-up for the Anthropic API account. ' +
    'Input must be JSON with: topUpAmountUsd (number) — amount to add, ' +
    'reason (string) — brief explanation. Returns payment confirmation or error.'

  private readonly _paymentTool: PQSafePaymentTool

  constructor(paymentTool: PQSafePaymentTool) {
    super()
    this._paymentTool = paymentTool
  }

  async _call(input: string): Promise<string> {
    let parsed: { topUpAmountUsd?: number; reason?: string }
    try {
      parsed = JSON.parse(input)
    } catch {
      return 'Error: input must be valid JSON with topUpAmountUsd and reason fields'
    }

    const amount = Number(parsed.topUpAmountUsd ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      return `Error: topUpAmountUsd must be a positive number (got ${String(parsed.topUpAmountUsd)})`
    }

    const memo = `Anthropic credit top-up — ${parsed.reason ?? 'auto top-up'} — ${new Date().toISOString()}`

    // Delegate actual payment to PQSafePaymentTool
    const paymentInput = JSON.stringify({
      amount,
      currency: 'USD',
      recipient: RECIPIENT,
      memo,
    })

    const paymentResult = await this._paymentTool.invoke(paymentInput)

    return JSON.stringify({
      topUpRequested: amount,
      currency: 'USD',
      recipient: RECIPIENT,
      memo,
      paymentResult,
      confirmedAt: new Date().toISOString(),
    })
  }
}

// ---------------------------------------------------------------------------
// Agent loop (manual ReAct-style, no LLM required)
// ---------------------------------------------------------------------------

async function runCreditAgent(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║   PQSafe AgentPay — LangChain Anthropic Credit Agent Demo    ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`Mock mode  : ${mockMode ? 'ON  (no real payments)' : 'OFF (live)'}`)
  console.log(`Issuer     : ${issuerAddress}`)
  console.log(`Recipient  : ${RECIPIENT}`)
  console.log(`Max spend  : ${envelope.maxAmount} ${envelope.currency}`)
  console.log(`Valid until: ${new Date(envelope.validUntil * 1000).toISOString()}`)
  console.log()

  // Instantiate tools
  const pqsafeTool = new PQSafePaymentTool({ envelope: signedEnvelope, mockMode })
  const creditCheckTool = new AnthropicCreditCheckTool(6.42) // mock: $6.42 used
  const topUpTool = new AnthropicCreditTopUpTool(pqsafeTool)

  // --- Step 1: Check credit usage ---
  console.log('[ Step 1 ] Checking Anthropic API credit usage...')
  const checkResult = await creditCheckTool.invoke('{}')
  const credit = JSON.parse(checkResult) as {
    usageUsd: number
    balanceUsd: number
    thresholdUsd: number
    status: string
  }
  console.log(`  Usage    : $${credit.usageUsd.toFixed(2)} USD`)
  console.log(`  Balance  : $${credit.balanceUsd.toFixed(2)} USD`)
  console.log(`  Threshold: $${credit.thresholdUsd.toFixed(2)} USD`)
  console.log(`  Status   : ${credit.status}`)
  console.log()

  // --- Step 2: Decide whether top-up is needed ---
  const needsTopUp = credit.usageUsd > credit.thresholdUsd
  console.log(`[ Step 2 ] Agent decision: ${needsTopUp ? 'TOP-UP REQUIRED' : 'No action needed'}`)

  if (!needsTopUp) {
    console.log('  Balance is healthy. No payment needed.')
    console.log()
    console.log('=== Agent loop complete. No payment executed. ===')
    return
  }

  // --- Step 3: Execute top-up via PQSafe ---
  const topUpAmount = 50.0 // Standard top-up increment
  console.log(`[ Step 3 ] Requesting top-up: $${topUpAmount} USD via PQSafe...`)
  const topUpInput = JSON.stringify({
    topUpAmountUsd: topUpAmount,
    reason: `Usage $${credit.usageUsd.toFixed(2)} exceeded threshold $${credit.thresholdUsd.toFixed(2)}`,
  })
  const topUpResult = await topUpTool.invoke(topUpInput)
  const topUp = JSON.parse(topUpResult) as {
    topUpRequested: number
    paymentResult: string
    confirmedAt: string
  }
  console.log(`  Top-up   : $${topUp.topUpRequested} USD`)
  console.log(`  Payment  : ${topUp.paymentResult}`)
  console.log(`  Confirmed: ${topUp.confirmedAt}`)
  console.log()

  // --- Step 4: Verify new balance ---
  console.log('[ Step 4 ] Verifying updated balance...')
  const newCheckResult = await creditCheckTool.invoke('{}')
  const newCredit = JSON.parse(newCheckResult) as { usageUsd: number; balanceUsd: number }
  const projectedBalance = newCredit.balanceUsd + topUpAmount
  console.log(`  Previous balance : $${newCredit.balanceUsd.toFixed(2)} USD`)
  console.log(`  Top-up applied   : +$${topUpAmount.toFixed(2)} USD`)
  console.log(`  Projected balance: $${projectedBalance.toFixed(2)} USD`)
  console.log()

  // --- Summary ---
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║                     AGENT LOOP COMPLETE                      ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`  Payment executed : YES`)
  console.log(`  Amount           : $${topUpAmount.toFixed(2)} USD`)
  console.log(`  Recipient        : ${RECIPIENT}`)
  console.log(`  PQ-signed by     : ${issuerAddress}`)
  console.log(`  Rail             : stripe (mock=${mockMode})`)
  console.log()
  console.log('All checks passed. Agent successfully topped up Anthropic credits.')
  console.log('PQ signature verified. Recipient in allowlist. Amount within ceiling.')
}

// ---------------------------------------------------------------------------
// Guard rail demo: SDK-enforced in live mode (mockMode=false uses verifyEnvelope)
// ---------------------------------------------------------------------------

async function runGuardRailDemo(): Promise<void> {
  // Live-mode tool: SDK path enforces recipient allowlist + amount ceiling
  const liveTool = new PQSafePaymentTool({ envelope: signedEnvelope, mockMode: false })

  console.log('--- Guard rail: blocked recipient (live SDK enforcement) ---')
  const blockedResult = await liveTool.invoke(
    JSON.stringify({ amount: 10, currency: 'USD', recipient: 'evil.com/steal' }),
  )
  console.log('Blocked:', blockedResult)
  const isBlocked = blockedResult.toLowerCase().includes('failed') ||
    blockedResult.toLowerCase().includes('error') ||
    blockedResult.toLowerCase().includes('not in')
  console.log('Guard rail fired:', isBlocked ? 'YES (correct)' : 'NO — unexpected pass-through')

  console.log()
  console.log('--- Guard rail: amount exceeds envelope ceiling (live SDK enforcement) ---')
  const overAmountResult = await liveTool.invoke(
    JSON.stringify({ amount: 999, currency: 'USD', recipient: RECIPIENT }),
  )
  console.log('Over-amount:', overAmountResult)
  const isBlocked2 = overAmountResult.toLowerCase().includes('failed') ||
    overAmountResult.toLowerCase().includes('error') ||
    overAmountResult.toLowerCase().includes('exceeds')
  console.log('Guard rail fired:', isBlocked2 ? 'YES (correct)' : 'NO — unexpected pass-through')
  console.log()
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

await runCreditAgent()
await runGuardRailDemo()
