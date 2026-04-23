/**
 * PQSafe AgentPay — MCP Server (Cloudflare Worker)
 *
 * Exposes PQSafe payment primitives as MCP tools so any MCP-compatible
 * host (Claude Desktop, Cursor, etc.) can let its AI issue PQ-signed payments.
 *
 * Tools:
 *   pqsafe_create_envelope  — build a SpendEnvelope JSON ready for signing
 *   pqsafe_pay              — verify a signed envelope and execute a payment
 *   pqsafe_check_balance    — check remaining budget on a signed envelope
 *
 * Deployment: Cloudflare Worker at mcp.pqsafe.xyz/mcp
 *
 * MCP spec: https://modelcontextprotocol.io/docs/specification
 * Transport: HTTP Streamable (POST /mcp, SSE stream response)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js'

// ---------------------------------------------------------------------------
// Environment bindings (Cloudflare Worker)
// ---------------------------------------------------------------------------

export interface Env {
  /** PQSafe REST API base URL */
  PQSAFE_API_URL: string
  /** Bearer token for PQSafe write endpoints */
  PQSAFE_API_KEY: string
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: Tool[] = [
  {
    name: 'pqsafe_create_envelope',
    description:
      'Create a SpendEnvelope JSON object ready for ML-DSA-65 signing. ' +
      'Returns the unsigned envelope that a wallet owner must sign before any payment can be made.',
    inputSchema: {
      type: 'object',
      properties: {
        issuer: {
          type: 'string',
          description:
            'PQSafe wallet address of the human issuer (format: pq1 + 40 hex chars). ' +
            'Example: pq1a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b',
        },
        agent: {
          type: 'string',
          description:
            'Identifier for this AI agent (e.g. "my-research-agent-v1", "claude-shopper"). Max 128 chars.',
        },
        max_amount: {
          type: 'number',
          description: 'Maximum total amount the agent may spend (positive number).',
        },
        currency: {
          type: 'string',
          description: 'ISO 4217 currency code (e.g. "USD", "HKD", "EUR").',
        },
        allowed_recipients: {
          type: 'array',
          items: { type: 'string' },
          description:
            'List of recipients the agent is allowed to pay. ' +
            'Rail-specific format (IBAN, crypto address, Stripe customer ID, etc.). ' +
            'Must have at least one entry.',
        },
        ttl_seconds: {
          type: 'number',
          description: 'How long the envelope is valid (seconds). Default: 3600 (1 hour).',
        },
        rail: {
          type: 'string',
          enum: ['airwallex', 'wise', 'stripe', 'usdc-base', 'x402'],
          description: 'Optional: constrain to a specific payment rail. Omit to let router choose.',
        },
      },
      required: ['issuer', 'agent', 'max_amount', 'currency', 'allowed_recipients'],
    },
  },
  {
    name: 'pqsafe_pay',
    description:
      'Verify a PQ-signed SpendEnvelope and execute a payment. ' +
      'Checks: ML-DSA-65 signature, temporal validity, recipient allowlist, amount ceiling, nonce replay. ' +
      'Returns transferId, status, amount, recipient.',
    inputSchema: {
      type: 'object',
      properties: {
        envelope_json: {
          type: 'string',
          description: 'The canonical envelope JSON string (from signEnvelope output).',
        },
        signature: {
          type: 'string',
          description: 'ML-DSA-65 signature over envelope_json bytes, hex-encoded.',
        },
        dsa_public_key: {
          type: 'string',
          description: "Issuer's ML-DSA-65 public key, hex-encoded.",
        },
        recipient: {
          type: 'string',
          description:
            'Recipient address. Must be in the envelope allowedRecipients list. ' +
            'Rail-specific format (e.g. IBAN for Airwallex/Wise, ETH address for USDC).',
        },
        amount: {
          type: 'number',
          description: 'Amount to transfer. Must be <= envelope maxAmount.',
        },
        memo: {
          type: 'string',
          description: 'Optional human-readable memo / reference (e.g. "Perplexity Pro subscription").',
        },
      },
      required: ['envelope_json', 'signature', 'dsa_public_key', 'recipient', 'amount'],
    },
  },
  {
    name: 'pqsafe_check_balance',
    description:
      'Inspect a signed SpendEnvelope and return its constraints without executing a payment. ' +
      'Useful for an agent to verify it has sufficient budget before attempting a payment.',
    inputSchema: {
      type: 'object',
      properties: {
        envelope_json: {
          type: 'string',
          description: 'The canonical envelope JSON string.',
        },
        signature: {
          type: 'string',
          description: 'ML-DSA-65 signature, hex-encoded.',
        },
        dsa_public_key: {
          type: 'string',
          description: "Issuer's ML-DSA-65 public key, hex-encoded.",
        },
      },
      required: ['envelope_json', 'signature', 'dsa_public_key'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function createEnvelopeLocally(args: Record<string, unknown>): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000)
  const ttl = (args.ttl_seconds as number | undefined) ?? 3600

  const envelope: Record<string, unknown> = {
    version: 1,
    issuer: args.issuer,
    agent: args.agent,
    maxAmount: args.max_amount,
    currency: (args.currency as string).toUpperCase(),
    allowedRecipients: args.allowed_recipients,
    validFrom: now,
    validUntil: now + ttl,
    nonce: generateNonce(),
  }

  if (args.rail) {
    envelope.rail = args.rail
  }

  return envelope
}

async function callPQSafeAPI(
  env: Env,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${env.PQSAFE_API_URL}${path}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.PQSAFE_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json()) as Record<string, unknown>

  if (!res.ok) {
    const detail = (data.detail as string) ?? `HTTP ${res.status}`
    throw new Error(`PQSafe API error: ${detail}`)
  }

  return data
}

async function handleCreateEnvelope(args: Record<string, unknown>): Promise<string> {
  // Validate required fields
  const required = ['issuer', 'agent', 'max_amount', 'currency', 'allowed_recipients']
  for (const field of required) {
    if (args[field] === undefined) {
      throw new Error(`Missing required field: ${field}`)
    }
  }

  if (!String(args.issuer).match(/^pq1[0-9a-f]{40}$/)) {
    throw new Error(
      'issuer must be a valid PQSafe address: pq1 followed by 40 hex characters. ' +
        'Example: pq1a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b',
    )
  }

  if (!Array.isArray(args.allowed_recipients) || args.allowed_recipients.length === 0) {
    throw new Error('allowed_recipients must be a non-empty array of recipient addresses')
  }

  const envelope = createEnvelopeLocally(args)
  const envelopeJson = JSON.stringify(envelope, Object.keys(envelope).sort())

  return JSON.stringify(
    {
      envelope,
      envelopeJson,
      instructions:
        'This envelope is UNSIGNED. To use it: ' +
        '1) Sign envelopeJson with ML-DSA-65 using the issuer secret key. ' +
        '2) Pass envelope_json + signature + dsa_public_key to pqsafe_pay.',
    },
    null,
    2,
  )
}

async function handlePay(
  args: Record<string, unknown>,
  env: Env,
): Promise<string> {
  const result = await callPQSafeAPI(env, '/v1/pay', {
    envelope_json: args.envelope_json,
    signature: args.signature,
    dsaPublicKey: args.dsa_public_key,
    recipient: args.recipient,
    amount: args.amount,
    memo: args.memo,
  })

  return JSON.stringify(
    {
      transferId: result.transferId,
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      recipient: result.recipient,
      rail: result.rail,
      executedAt: result.executedAt,
      meta: result.meta,
    },
    null,
    2,
  )
}

async function handleCheckBalance(
  args: Record<string, unknown>,
): Promise<string> {
  // Parse envelope locally (no API call needed — just inspect the JSON)
  let envelope: Record<string, unknown>
  try {
    envelope = JSON.parse(args.envelope_json as string) as Record<string, unknown>
  } catch {
    throw new Error('envelope_json is not valid JSON')
  }

  const now = Math.floor(Date.now() / 1000)
  const validFrom = envelope.validFrom as number
  const validUntil = envelope.validUntil as number
  const maxAmount = envelope.maxAmount as number
  const currency = envelope.currency as string
  const allowedRecipients = envelope.allowedRecipients as string[]

  const secondsRemaining = Math.max(0, validUntil - now)
  const isActive = now >= validFrom && now <= validUntil
  const isExpired = now > validUntil
  const notYetActive = now < validFrom

  return JSON.stringify(
    {
      valid: isActive,
      expired: isExpired,
      notYetActive,
      maxAmount,
      currency,
      allowedRecipients,
      agent: envelope.agent,
      issuer: envelope.issuer,
      validFrom: new Date(validFrom * 1000).toISOString(),
      validUntil: new Date(validUntil * 1000).toISOString(),
      secondsRemaining,
      rail: envelope.rail ?? 'auto (router will choose)',
      note:
        'This tool only reads the envelope JSON — it does NOT verify the ML-DSA-65 signature. ' +
        'The signature is verified by the PQSafe API when you call pqsafe_pay.',
    },
    null,
    2,
  )
}

// ---------------------------------------------------------------------------
// Cloudflare Worker entry point (HTTP Streamable MCP transport)
// ---------------------------------------------------------------------------

// In-memory session store for SSE connections (Cloudflare Workers are single-threaded)
const sessions = new Map<string, { controller: ReadableStreamDefaultController }>()

function createMCPResponse(id: unknown, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result })
}

function createMCPError(id: unknown, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    // Health check
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'pqsafe-mcp', version: '0.1.0' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // MCP endpoint
    if (url.pathname === '/mcp') {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders })
      }

      let body: Record<string, unknown>
      try {
        body = (await request.json()) as Record<string, unknown>
      } catch {
        return new Response(
          createMCPError(null, -32700, 'Parse error: invalid JSON'),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const { id, method, params } = body as {
        id: unknown
        method: string
        params?: Record<string, unknown>
      }

      try {
        let result: unknown

        if (method === 'initialize') {
          result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'pqsafe-mcp', version: '0.1.0' },
          }
        } else if (method === 'tools/list') {
          result = { tools: TOOLS }
        } else if (method === 'tools/call') {
          const toolName = (params as { name: string; arguments: Record<string, unknown> }).name
          const toolArgs = (params as { name: string; arguments: Record<string, unknown> }).arguments ?? {}

          let content: string

          if (toolName === 'pqsafe_create_envelope') {
            content = await handleCreateEnvelope(toolArgs)
          } else if (toolName === 'pqsafe_pay') {
            content = await handlePay(toolArgs, env)
          } else if (toolName === 'pqsafe_check_balance') {
            content = await handleCheckBalance(toolArgs)
          } else {
            throw new Error(`Unknown tool: ${toolName}`)
          }

          result = {
            content: [{ type: 'text', text: content }],
          }
        } else if (method === 'notifications/initialized' || method === 'ping') {
          // Notifications and ping don't need a response body
          return new Response(null, { status: 204, headers: corsHeaders })
        } else {
          throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 })
        }

        return new Response(createMCPResponse(id, result), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (err) {
        const e = err as Error & { code?: number }
        const code = e.code ?? -32603
        return new Response(createMCPError(id, code, e.message), {
          status: code === -32601 ? 404 : 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders })
  },
}
