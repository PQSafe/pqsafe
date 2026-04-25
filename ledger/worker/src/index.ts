/**
 * PQSafe AgentPay — Public Transfer Ledger
 * Cloudflare Worker + D1
 *
 * Endpoints:
 *   POST /v1/log                  — ingest anonymized transfer (API key required)
 *   GET  /v1/transfers            — recent transfers (public)
 *   GET  /v1/transfers/:hash      — single record by envelope hash (public)
 *   GET  /v1/stats                — aggregate counters (public)
 */

export interface Env {
  DB: D1Database
  LEDGER_API_KEY: string   // wrangler secret: wrangler secret put LEDGER_API_KEY
  CORS_ORIGIN: string      // e.g. "https://pqsafe.xyz"
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AmountBucket = '<10' | '10-100' | '100-1000' | '1000-10000' | '>10000'
type Rail = 'airwallex' | 'wise' | 'stripe' | 'usdc-base' | 'x402'
type Outcome = 'success' | 'failed' | 'rejected' | 'pending'

interface LogPayload {
  envelopeHash: string   // SHA-256 hex of signed envelope bytes
  rail: Rail
  amountBucket: AmountBucket
  currency: string
  outcome: Outcome
  timestamp: number      // Unix seconds
  agentIdHash: string    // SHA-256 hex of agent identifier
}

interface TransferRecord {
  id: number
  envelopeHash: string
  agentIdHash: string
  rail: Rail
  amountBucket: AmountBucket
  currency: string
  outcome: Outcome
  createdAt: number
}

// ---------------------------------------------------------------------------
// Bucket midpoints (USD-equivalent estimate for stat rollup)
// ---------------------------------------------------------------------------

const BUCKET_MIDPOINTS: Record<AmountBucket, number> = {
  '<10': 5,
  '10-100': 55,
  '100-1000': 550,
  '1000-10000': 5500,
  '>10000': 15000,
}

const VALID_RAILS: Rail[] = ['airwallex', 'wise', 'stripe', 'usdc-base', 'x402']
const VALID_BUCKETS: AmountBucket[] = ['<10', '10-100', '100-1000', '1000-10000', '>10000']
const VALID_OUTCOMES: Outcome[] = ['success', 'failed', 'rejected', 'pending']

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
    'Access-Control-Max-Age': '86400',
  }
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}

function err(message: string, status: number, cors: Record<string, string>): Response {
  return json({ error: message }, status, cors)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateLogPayload(body: unknown): { payload: LogPayload; error?: never } | { error: string; payload?: never } {
  if (typeof body !== 'object' || body === null) return { error: 'Body must be a JSON object' }
  const b = body as Record<string, unknown>

  const envelopeHash = b['envelopeHash']
  if (typeof envelopeHash !== 'string' || !/^[0-9a-f]{64}$/i.test(envelopeHash)) {
    return { error: 'envelopeHash must be a 64-char hex string (SHA-256)' }
  }

  const agentIdHash = b['agentIdHash']
  if (typeof agentIdHash !== 'string' || !/^[0-9a-f]{64}$/i.test(agentIdHash)) {
    return { error: 'agentIdHash must be a 64-char hex string (SHA-256)' }
  }

  const rail = b['rail']
  if (!VALID_RAILS.includes(rail as Rail)) {
    return { error: `rail must be one of: ${VALID_RAILS.join(', ')}` }
  }

  const amountBucket = b['amountBucket']
  if (!VALID_BUCKETS.includes(amountBucket as AmountBucket)) {
    return { error: `amountBucket must be one of: ${VALID_BUCKETS.join(', ')}` }
  }

  const currency = b['currency']
  if (typeof currency !== 'string' || currency.length < 3 || currency.length > 5) {
    return { error: 'currency must be a 3-5 character code (e.g. USD, USDC)' }
  }

  const outcome = b['outcome']
  if (!VALID_OUTCOMES.includes(outcome as Outcome)) {
    return { error: `outcome must be one of: ${VALID_OUTCOMES.join(', ')}` }
  }

  const timestamp = b['timestamp']
  if (typeof timestamp !== 'number' || !Number.isInteger(timestamp) || timestamp <= 0) {
    return { error: 'timestamp must be a positive Unix integer (seconds)' }
  }

  return {
    payload: {
      envelopeHash: envelopeHash.toLowerCase(),
      agentIdHash: (agentIdHash as string).toLowerCase(),
      rail: rail as Rail,
      amountBucket: amountBucket as AmountBucket,
      currency: (currency as string).toUpperCase(),
      outcome: outcome as Outcome,
      timestamp: timestamp as number,
    },
  }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleLog(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  // Auth
  const apiKey = request.headers.get('X-Api-Key') ?? ''
  if (apiKey !== env.LEDGER_API_KEY) {
    return err('Unauthorized — provide a valid X-Api-Key header', 401, cors)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return err('Invalid JSON body', 400, cors)
  }

  const result = validateLogPayload(body)
  if (result.error) return err(result.error, 400, cors)
  const p = result.payload!

  try {
    await env.DB.prepare(
      `INSERT INTO transfers (envelope_hash, agent_id_hash, rail, amount_bucket, currency, outcome, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(p.envelopeHash, p.agentIdHash, p.rail, p.amountBucket, p.currency, p.outcome, p.timestamp)
      .run()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('UNIQUE constraint failed')) {
      return err('Duplicate envelope_hash — this transfer was already logged', 409, cors)
    }
    console.error('D1 insert error:', msg)
    return err('Database error', 500, cors)
  }

  return json({ ok: true, envelopeHash: p.envelopeHash }, 201, cors)
}

async function handleList(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  const url = new URL(request.url)
  const limitParam = parseInt(url.searchParams.get('limit') ?? '20', 10)
  const limit = Math.min(Math.max(1, isNaN(limitParam) ? 20 : limitParam), 50)

  const { results } = await env.DB.prepare(
    `SELECT id, envelope_hash, agent_id_hash, rail, amount_bucket, currency, outcome, created_at
     FROM transfers
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{
      id: number
      envelope_hash: string
      agent_id_hash: string
      rail: string
      amount_bucket: string
      currency: string
      outcome: string
      created_at: number
    }>()

  const records: TransferRecord[] = (results ?? []).map(r => ({
    id: r.id,
    envelopeHash: r.envelope_hash,
    agentIdHash: r.agent_id_hash,
    rail: r.rail as Rail,
    amountBucket: r.amount_bucket as AmountBucket,
    currency: r.currency,
    outcome: r.outcome as Outcome,
    createdAt: r.created_at,
  }))

  return json({ transfers: records, count: records.length }, 200, cors)
}

async function handleGetByHash(hash: string, env: Env, cors: Record<string, string>): Promise<Response> {
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    return err('hash must be a 64-char hex string', 400, cors)
  }

  const row = await env.DB.prepare(
    `SELECT id, envelope_hash, agent_id_hash, rail, amount_bucket, currency, outcome, created_at
     FROM transfers WHERE envelope_hash = ?`,
  )
    .bind(hash.toLowerCase())
    .first<{
      id: number
      envelope_hash: string
      agent_id_hash: string
      rail: string
      amount_bucket: string
      currency: string
      outcome: string
      created_at: number
    }>()

  if (!row) return err('Transfer not found', 404, cors)

  return json(
    {
      id: row.id,
      envelopeHash: row.envelope_hash,
      agentIdHash: row.agent_id_hash,
      rail: row.rail,
      amountBucket: row.amount_bucket,
      currency: row.currency,
      outcome: row.outcome,
      createdAt: row.created_at,
    },
    200,
    cors,
  )
}

async function handleStats(env: Env, cors: Record<string, string>): Promise<Response> {
  // Run aggregate queries in parallel
  const [countRow, bucketRows, agentRow, latestRow] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as total FROM transfers`).first<{ total: number }>(),
    env.DB.prepare(`SELECT amount_bucket, COUNT(*) as cnt FROM transfers GROUP BY amount_bucket`)
      .all<{ amount_bucket: string; cnt: number }>(),
    env.DB.prepare(`SELECT COUNT(DISTINCT agent_id_hash) as total FROM transfers`).first<{ total: number }>(),
    env.DB.prepare(`SELECT MAX(created_at) as ts FROM transfers`).first<{ ts: number | null }>(),
  ])

  const totalTransfers = countRow?.total ?? 0
  const activeAgents = agentRow?.total ?? 0

  // Estimate total USD routed using bucket midpoints
  let totalUSDRouted = 0
  for (const row of bucketRows.results ?? []) {
    const midpoint = BUCKET_MIDPOINTS[row.amount_bucket as AmountBucket] ?? 0
    totalUSDRouted += midpoint * row.cnt
  }

  return json(
    {
      totalTransfers,
      totalUSDRouted: Math.round(totalUSDRouted),
      activeAgents,
      lastUpdated: latestRow?.ts ?? null,
    },
    200,
    cors,
  )
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const cors = corsHeaders(env.CORS_ORIGIN ?? '*')

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const path = url.pathname

    try {
      // POST /v1/log
      if (request.method === 'POST' && path === '/v1/log') {
        return await handleLog(request, env, cors)
      }

      // GET /v1/stats
      if (request.method === 'GET' && path === '/v1/stats') {
        return await handleStats(env, cors)
      }

      // GET /v1/transfers
      if (request.method === 'GET' && path === '/v1/transfers') {
        return await handleList(request, env, cors)
      }

      // GET /v1/transfers/:hash
      const txMatch = path.match(/^\/v1\/transfers\/([0-9a-fA-F]+)$/)
      if (request.method === 'GET' && txMatch) {
        return await handleGetByHash(txMatch[1], env, cors)
      }

      return err('Not found', 404, cors)
    } catch (e: unknown) {
      console.error('Unhandled error:', e)
      return err('Internal server error', 500, cors)
    }
  },
}
