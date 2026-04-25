/**
 * PQSafe AgentPay — Claude Code / OpenHands / Agent SDK Integration
 *
 * This shows how an AI coding agent (Claude Code, OpenHands, Devin, etc.)
 * can use PQSafe to autonomously pay for the tools it needs:
 *   - Its own API credits (Anthropic, OpenAI, Perplexity)
 *   - Cloud compute (Vercel, AWS, Cloudflare)
 *   - SaaS subscriptions (GitHub Copilot, Linear, Notion)
 *
 * The agent never holds payment credentials. It holds a SpendEnvelope —
 * a ML-DSA-65 post-quantum signed authorization from its human operator.
 * The envelope defines exactly what it can spend, to whom, and for how long.
 *
 * ────────────────────────────────────────────────────
 * FOR MCP USERS (Claude Desktop, Cursor, Claude Code):
 * ────────────────────────────────────────────────────
 *   Add to claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "pqsafe": {
 *         "url": "https://mcp.pqsafe.xyz/mcp"
 *       }
 *     }
 *   }
 *
 *   Then ask Claude: "Pay $20 to anthropic.com/billing for API credits."
 *   Claude will call pqsafe_pay using the envelope you pre-signed.
 *
 * ──────────────────────────────────────────────
 * FOR SDK USERS (custom agents, OpenHands, etc):
 * ──────────────────────────────────────────────
 *   npm install @pqsafe/agent-pay
 *   See the code below.
 *
 * Run:
 *   cd agent-pay
 *   npm install
 *   ANTHROPIC_API_KEY=sk-... npm run demo:claude-code
 */

import Anthropic from '@anthropic-ai/sdk'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import {
  createEnvelope,
  signEnvelope,
  executeAgentPayment,
} from '../src/index.js'

// ---------------------------------------------------------------------------
// Terminal helpers
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', magenta: '\x1b[35m', blue: '\x1b[34m',
  gray: '\x1b[90m',
}

const line = (n = 72) => '─'.repeat(n)
function say(label: string, value: string) {
  console.log(`  ${C.dim}${label.padEnd(22)}${C.reset} ${value}`)
}
function ok(msg: string) { console.log(`  ${C.green}✓${C.reset} ${msg}`) }

// ---------------------------------------------------------------------------
// Build a spend envelope pre-authorizing the agent to buy API credits
// ---------------------------------------------------------------------------

function buildAgentEnvelope() {
  const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const { publicKey, secretKey } = ml_dsa65.keygen(seed)
  const issuer = 'pq1' + bytesToHex(keccak_256(publicKey).slice(0, 20))

  // The human operator signs this ONCE. The agent gets the signed envelope.
  const envelope = createEnvelope({
    issuer,
    agent: 'claude-code-agent-v1',  // ← this is Claude Code
    maxAmount: 50,                   // ← $50 max spend
    currency: 'USD',
    allowedRecipients: [
      'anthropic.com/billing',       // ← Claude API credits
      'openai.com/billing',          // ← OpenAI API credits (if agent needs GPT fallback)
      'vercel.com/billing',          // ← deployment costs
    ],
    ttlSeconds: 86400,               // ← valid 24 hours
    rail: 'airwallex',
  })

  const signed = signEnvelope(envelope, secretKey, publicKey)
  return { issuer, envelope, signed }
}

// ---------------------------------------------------------------------------
// PQSafe payment tool for Claude Code to call
// ---------------------------------------------------------------------------

async function pqsafePay(
  signed: ReturnType<typeof buildAgentEnvelope>['signed'],
  recipient: string,
  amount: number,
  memo: string,
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const result = await executeAgentPayment(signed, { recipient, amount, memo })
    return { success: true, txId: result.txId }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------------------
// Claude Code agent simulation
// ---------------------------------------------------------------------------

async function main() {
  console.log('')
  console.log(`${C.magenta}${C.bold}  PQSafe AgentPay — Claude Code Integration${C.reset}`)
  console.log(`${C.gray}  The AI agent that runs your code. Also manages its own budget.${C.reset}`)
  console.log('')

  // Human operator sets up the budget ONCE
  console.log(`${C.cyan}${line()}${C.reset}`)
  console.log(`${C.cyan}${C.bold}  Operator setup — sign the agent's spending budget${C.reset}`)
  console.log(`${C.cyan}${line()}${C.reset}`)
  console.log(`  ${C.dim}(You do this once. Claude Code uses the envelope autonomously.)${C.reset}`)

  const { issuer, envelope, signed } = buildAgentEnvelope()
  say('Agent', `${C.bold}claude-code-agent-v1${C.reset}`)
  say('Max spend', `$${envelope.maxAmount} USD per session`)
  say('Allowed', `${envelope.allowedRecipients.length} recipients`)
  say('Valid for', '24 hours')
  say('Signed with', 'ML-DSA-65 (NIST FIPS 204 — quantum-safe)')
  ok('Envelope signed. Handed to Claude Code.')

  // Simulate the Claude Code agent receiving a task
  console.log(`\n${C.cyan}${line()}${C.reset}`)
  console.log(`${C.cyan}${C.bold}  Claude Code agent task${C.reset}`)
  console.log(`${C.cyan}${line()}${C.reset}`)

  const task = `You are Claude Code, running autonomously on a developer's machine.
Your current context: API rate limit exceeded. Anthropic API credits depleted.
You have a PQSafe SpendEnvelope in your context with $50 USD budget.

Available tool: pqsafe_pay(recipient, amount, memo)

Complete the task: Top up Anthropic API credits by $20 to continue working.`

  console.log(`\n  ${C.dim}Task:${C.reset}`)
  console.log(`  "${task.split('\n')[2]}"`)
  console.log(`  "${task.split('\n')[3]}"`)
  console.log(`  "${task.split('\n')[5]}"`)

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    // Simulation mode
    console.log(`\n  ${C.yellow}(Simulation — set ANTHROPIC_API_KEY for live Claude)${C.reset}`)
    console.log(`\n  ${C.blue}🤖 Claude Code:${C.reset} I see my API budget is exhausted.`)
    console.log(`  ${C.blue}🤖 Claude Code:${C.reset} I have a PQSafe envelope with $50 USD authorized.`)
    console.log(`  ${C.blue}🤖 Claude Code:${C.reset} Calling pqsafe_pay to top up Anthropic credits...`)

    const result = await pqsafePay(signed, 'anthropic.com/billing', 20, 'Claude API credits top-up')
    console.log('')
    if (result.success) {
      say('Transaction ID', `${C.bold}${result.txId}${C.reset}`)
      say('Amount', `$20 USD`)
      say('Recipient', `anthropic.com/billing`)
      say('Mode', result.txId?.includes('mock') ? `${C.yellow}mock${C.reset}` : `${C.green}real${C.reset}`)
      ok('Payment executed. Claude Code now has API credits.')
      console.log(`\n  ${C.blue}🤖 Claude Code:${C.reset} Credits topped up. Resuming task execution.`)
    } else {
      console.log(`  ${C.red}✗${C.reset} Payment failed: ${result.error}`)
    }
    showNarrative()
    return
  }

  // Live Claude Code simulation with real Anthropic API
  const client = new Anthropic({ apiKey })

  const tools: Anthropic.Tool[] = [
    {
      name: 'pqsafe_pay',
      description:
        'Execute a PQ-authorized payment. Only works for recipients in the pre-signed SpendEnvelope. ' +
        'Returns txId on success.',
      input_schema: {
        type: 'object' as const,
        properties: {
          recipient: { type: 'string', description: 'Recipient (must be in envelope allowedRecipients)' },
          amount: { type: 'number', description: 'Amount in USD (must be ≤ maxAmount)' },
          memo: { type: 'string', description: 'Payment memo / reference' },
        },
        required: ['recipient', 'amount', 'memo'],
      },
    },
  ]

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: task },
  ]

  let response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 512,
    tools,
    messages,
  })

  // Process tool calls
  for (const block of response.content) {
    if (block.type === 'text') {
      console.log(`\n  ${C.blue}🤖 Claude Code:${C.reset} ${block.text}`)
    }
  }

  if (response.stop_reason === 'tool_use') {
    const toolUse = response.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock
    if (toolUse && toolUse.name === 'pqsafe_pay') {
      const input = toolUse.input as { recipient: string; amount: number; memo: string }
      console.log(`\n  ${C.cyan}→ Claude Code calls:${C.reset} ${C.bold}pqsafe_pay${C.reset}`)
      say('Recipient', input.recipient)
      say('Amount', `$${input.amount} USD`)
      say('Memo', input.memo)

      const result = await pqsafePay(signed, input.recipient, input.amount, input.memo)

      if (result.success) {
        say('Transaction ID', `${C.bold}${result.txId}${C.reset}`)
        ok('Payment executed autonomously by Claude Code')
      } else {
        console.log(`  ${C.red}✗${C.reset} ${result.error}`)
      }

      // Return result to Claude
      messages.push({ role: 'assistant', content: response.content })
      messages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        }],
      })

      response = await client.messages.create({ model: 'claude-opus-4-7', max_tokens: 256, tools, messages })
      for (const block of response.content) {
        if (block.type === 'text') {
          console.log(`\n  ${C.blue}🤖 Claude Code:${C.reset} ${block.text}`)
        }
      }
    }
  }

  showNarrative()
}

function showNarrative() {
  console.log('')
  console.log(`${C.magenta}${line()}${C.reset}`)
  console.log(`  ${C.bold}The AI agent that writes your code also manages its own budget.${C.reset}`)
  console.log(`  ${C.dim}No credit card. No human approval. Post-quantum authorized.${C.reset}`)
  console.log('')
  console.log(`  ${C.bold}Use with Claude Desktop / Claude Code (MCP):${C.reset}`)
  console.log(`  ${C.dim}Add mcp.pqsafe.xyz/mcp to your claude_desktop_config.json${C.reset}`)
  console.log(`  ${C.dim}Claude will call pqsafe_pay automatically.${C.reset}`)
  console.log(`${C.magenta}${line()}${C.reset}`)
  console.log('')
}

main().catch((err) => {
  console.error(`${C.red}Demo failed:${C.reset}`, err)
  process.exit(1)
})
