#!/usr/bin/env node
/**
 * @pqsafe/mcp-server — PQSafe AgentPay MCP server.
 *
 * Exposes PQSafe payment primitives as MCP tools via stdio transport.
 * Compatible with Claude Desktop, Cursor, Windsurf, and any MCP host.
 *
 * Tools:
 *   pqsafe.create_envelope   — issuer builds and signs a SpendEnvelope
 *   pqsafe.verify_envelope   — standalone signature + schema verification
 *   pqsafe.execute_payment   — verify envelope + route payment to rail
 *   pqsafe.get_envelope_status — inspect expiry, budget, revocation stub
 *
 * Transport: stdio (MCP standard for local servers)
 *
 * MCP spec: https://modelcontextprotocol.io/docs/specification
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import {
  createEnvelope,
  signEnvelope,
  verifyEnvelope,
  executeAgentPayment,
  type SignedEnvelope,
  type RailConfig,
} from '@pqsafe/agent-pay'

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { hexToBytes, bytesToHex } from '@noble/hashes/utils.js'

// ---------------------------------------------------------------------------
// Server instance
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'pqsafe-mcp-server', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

// ---------------------------------------------------------------------------
// Tool: pqsafe.create_envelope
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'pqsafe.create_envelope',
      description:
        'Build a PQ-signed SpendEnvelope that authorizes an AI agent to execute payments. ' +
        'The issuer must provide their ML-DSA-65 secret key (hex) to sign the envelope. ' +
        'In mock mode (no secret_key), a dummy test keypair is generated automatically. ' +
        'Returns the signed envelope JSON (envelopeJson + signature + dsaPublicKey).',
      inputSchema: {
        type: 'object',
        properties: {
          issuer: {
            type: 'string',
            description:
              'PQSafe wallet address (pq1 + 40 hex chars). ' +
              'Example: pq1a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b. ' +
              'Omit to use a test address (mock mode).',
          },
          agent: {
            type: 'string',
            description: 'Identifier for the AI agent (e.g. "my-agent-v1"). Max 128 chars.',
          },
          max_amount: {
            type: 'number',
            description: 'Maximum total amount the agent may spend (positive number).',
          },
          currency: {
            type: 'string',
            description: 'ISO 4217 currency code (e.g. "USD", "HKD", "EUR") or crypto symbol.',
          },
          allowed_recipients: {
            type: 'array',
            items: { type: 'string' },
            description:
              'List of approved recipient addresses. ' +
              'Rail-specific format (IBAN, crypto address, Stripe customer ID). ' +
              'Must have at least one entry.',
          },
          ttl_seconds: {
            type: 'number',
            description: 'Validity window in seconds from now. Default: 3600 (1 hour).',
          },
          rail: {
            type: 'string',
            enum: ['airwallex', 'wise', 'stripe', 'usdc-base', 'x402'],
            description: 'Optional: constrain to a specific payment rail.',
          },
          secret_key_hex: {
            type: 'string',
            description:
              'ML-DSA-65 secret key of the issuer, hex-encoded. ' +
              'Omit to generate a throw-away test keypair (mock mode).',
          },
        },
        required: ['agent', 'max_amount', 'currency', 'allowed_recipients'],
      },
    },

    // -----------------------------------------------------------------------
    // Tool: pqsafe.verify_envelope
    // -----------------------------------------------------------------------
    {
      name: 'pqsafe.verify_envelope',
      description:
        'Verify a signed SpendEnvelope: checks ML-DSA-65 signature, Zod schema, and temporal validity. ' +
        'Does NOT execute a payment. Returns the parsed envelope fields on success, or an error.',
      inputSchema: {
        type: 'object',
        properties: {
          envelope_json: {
            type: 'string',
            description: 'The canonical envelope JSON string (from the signed envelope).',
          },
          signature: {
            type: 'string',
            description: 'ML-DSA-65 signature over envelope_json bytes, hex-encoded.',
          },
          dsa_public_key: {
            type: 'string',
            description: "Issuer's ML-DSA-65 public key, hex-encoded.",
          },
        },
        required: ['envelope_json', 'signature', 'dsa_public_key'],
      },
    },

    // -----------------------------------------------------------------------
    // Tool: pqsafe.execute_payment
    // -----------------------------------------------------------------------
    {
      name: 'pqsafe.execute_payment',
      description:
        'Verify a signed SpendEnvelope and execute a payment via the configured rail. ' +
        'Enforces: signature validity, recipient allowlist, amount ceiling, temporal validity. ' +
        'Set mock_mode=true to get a synthetic txId without hitting a real rail.',
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
          recipient: {
            type: 'string',
            description:
              'Recipient address. Must be in the envelope allowedRecipients list. ' +
              'Rail-specific format (IBAN, EVM address, Stripe customer ID, etc.).',
          },
          amount: {
            type: 'number',
            description: 'Amount to transfer. Must be <= envelope maxAmount.',
          },
          memo: {
            type: 'string',
            description: 'Optional human-readable memo / reference.',
          },
          mock_mode: {
            type: 'boolean',
            description:
              'If true, return a synthetic txId without calling any payment rail. ' +
              'Useful for demos, testing, and CI. Default: false.',
          },
        },
        required: ['envelope_json', 'signature', 'dsa_public_key', 'recipient', 'amount'],
      },
    },

    // -----------------------------------------------------------------------
    // Tool: pqsafe.get_envelope_status
    // -----------------------------------------------------------------------
    {
      name: 'pqsafe.get_envelope_status',
      description:
        'Inspect a SpendEnvelope and return its status: validity window, budget ceiling, ' +
        'allowed recipients, agent ID, and on-chain revocation stub. ' +
        'Does NOT verify the ML-DSA-65 signature — call pqsafe.verify_envelope for that.',
      inputSchema: {
        type: 'object',
        properties: {
          envelope_json: {
            type: 'string',
            description: 'The canonical envelope JSON string.',
          },
          check_revocation: {
            type: 'boolean',
            description:
              'If true, stub-check on-chain revocation registry (Arbitrum). ' +
              'Returns a note explaining that the on-chain check requires ARBITRUM_RPC_URL. ' +
              'Default: false.',
          },
        },
        required: ['envelope_json'],
      },
    },
  ],
}))

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params

  try {
    if (name === 'pqsafe.create_envelope') {
      return await handleCreateEnvelope(args as Record<string, unknown>)
    }
    if (name === 'pqsafe.verify_envelope') {
      return await handleVerifyEnvelope(args as Record<string, unknown>)
    }
    if (name === 'pqsafe.execute_payment') {
      return await handleExecutePayment(args as Record<string, unknown>)
    }
    if (name === 'pqsafe.get_envelope_status') {
      return await handleGetEnvelopeStatus(args as Record<string, unknown>)
    }
    throw new Error(`Unknown tool: ${name}`)
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    }
  }
})

// ---------------------------------------------------------------------------
// Handler implementations
// ---------------------------------------------------------------------------

async function handleCreateEnvelope(
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Build the envelope
  const envelope = createEnvelope({
    issuer: (args['issuer'] as string | undefined) ?? ('pq1' + 'a'.repeat(40)), // test address
    agent: args['agent'] as string,
    maxAmount: args['max_amount'] as number,
    currency: args['currency'] as string,
    allowedRecipients: args['allowed_recipients'] as string[],
    ttlSeconds: (args['ttl_seconds'] as number | undefined) ?? 3600,
    ...(args['rail'] ? { rail: args['rail'] as Parameters<typeof createEnvelope>[0]['rail'] } : {}),
  })

  // Sign: use provided key or generate throw-away test keypair
  let secretKeyBytes: Uint8Array
  let publicKeyBytes: Uint8Array

  if (typeof args['secret_key_hex'] === 'string' && args['secret_key_hex'].length > 0) {
    secretKeyBytes = hexToBytes(args['secret_key_hex'] as string)
    // Derive public key from secret key bytes (last 32 bytes are the seed for ml_dsa65)
    const seed = secretKeyBytes.slice(0, 32)
    const kp = ml_dsa65.keygen(seed)
    publicKeyBytes = kp.publicKey
  } else {
    // Mock mode — throw-away keypair
    const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
    const kp = ml_dsa65.keygen(seed)
    secretKeyBytes = kp.secretKey
    publicKeyBytes = kp.publicKey
  }

  const signed = signEnvelope(envelope, secretKeyBytes, publicKeyBytes)

  const text = JSON.stringify(
    {
      success: true,
      note:
        args['secret_key_hex']
          ? 'Envelope signed with provided key. Ready for executePayment.'
          : 'MOCK MODE: throw-away keypair used. signature is for testing only — not production.',
      signedEnvelope: signed,
      envelopeFields: envelope,
    },
    null,
    2,
  )

  return { content: [{ type: 'text', text }] }
}

async function handleVerifyEnvelope(
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const signed: SignedEnvelope = {
    envelopeJson: args['envelope_json'] as string,
    signature: args['signature'] as string,
    dsaPublicKey: args['dsa_public_key'] as string,
  }

  const envelope = verifyEnvelope(signed)

  const now = Math.floor(Date.now() / 1000)
  const secondsRemaining = Math.max(0, envelope.validUntil - now)

  const text = JSON.stringify(
    {
      valid: true,
      envelope: {
        ...envelope,
        validFromIso: new Date(envelope.validFrom * 1000).toISOString(),
        validUntilIso: new Date(envelope.validUntil * 1000).toISOString(),
        secondsRemaining,
      },
    },
    null,
    2,
  )

  return { content: [{ type: 'text', text }] }
}

async function handleExecutePayment(
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const signed: SignedEnvelope = {
    envelopeJson: args['envelope_json'] as string,
    signature: args['signature'] as string,
    dsaPublicKey: args['dsa_public_key'] as string,
  }

  const recipient = args['recipient'] as string
  const amount = args['amount'] as number
  const memo = args['memo'] as string | undefined
  const mockMode = (args['mock_mode'] as boolean | undefined) ?? false

  if (mockMode) {
    // Verify the envelope (signature + schema + temporal) but skip rail
    const envelope = verifyEnvelope(signed)

    // Enforce constraints locally in mock mode
    if (!envelope.allowedRecipients.includes(recipient)) {
      throw new Error(
        `Recipient "${recipient}" not in allowlist. Allowed: [${envelope.allowedRecipients.join(', ')}]`,
      )
    }
    if (amount > envelope.maxAmount) {
      throw new Error(
        `Amount ${amount} exceeds envelope maxAmount ${envelope.maxAmount} ${envelope.currency}`,
      )
    }

    const mockTxId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const text = JSON.stringify(
      {
        success: true,
        mockMode: true,
        txId: mockTxId,
        rail: envelope.rail ?? 'airwallex',
        amount,
        currency: envelope.currency,
        recipient,
        executedAt: new Date().toISOString(),
        meta: { mockMode: true },
      },
      null,
      2,
    )
    return { content: [{ type: 'text', text }] }
  }

  // Live mode — full SDK path
  const railConfig: RailConfig | undefined = undefined // use envelope's rail field

  const result = await executeAgentPayment(signed, { recipient, amount, memo }, railConfig)

  const text = JSON.stringify({ ...result }, null, 2)
  return { content: [{ type: 'text', text }] }
}

async function handleGetEnvelopeStatus(
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  let envelope: Record<string, unknown>
  try {
    envelope = JSON.parse(args['envelope_json'] as string) as Record<string, unknown>
  } catch {
    throw new Error('envelope_json is not valid JSON')
  }

  const now = Math.floor(Date.now() / 1000)
  const validFrom = envelope['validFrom'] as number
  const validUntil = envelope['validUntil'] as number
  const maxAmount = envelope['maxAmount'] as number
  const currency = envelope['currency'] as string
  const allowedRecipients = envelope['allowedRecipients'] as string[]

  const isActive = now >= validFrom && now <= validUntil
  const isExpired = now > validUntil
  const notYetActive = now < validFrom
  const secondsRemaining = Math.max(0, validUntil - now)

  const checkRevocation = (args['check_revocation'] as boolean | undefined) ?? false
  const revocationNote = checkRevocation
    ? 'Revocation check requires ARBITRUM_RPC_URL and the SpendEnvelopeRegistry address. ' +
      'Call commitEnvelopeToArbitrum() from @pqsafe/agent-pay in your backend. ' +
      'See: https://pqsafe.xyz/handbook#arbitrum'
    : 'Revocation check skipped (check_revocation=false).'

  const text = JSON.stringify(
    {
      id: envelope['nonce'] ?? null,
      valid: isActive,
      expired: isExpired,
      notYetActive,
      secondsRemaining,
      maxAmount,
      currency,
      allowedRecipients,
      agent: envelope['agent'],
      issuer: envelope['issuer'],
      rail: envelope['rail'] ?? 'auto',
      validFrom: new Date(validFrom * 1000).toISOString(),
      validUntil: new Date(validUntil * 1000).toISOString(),
      revocation: {
        checked: false,
        note: revocationNote,
      },
      signatureNote:
        'Signature NOT verified — call pqsafe.verify_envelope for full verification.',
    },
    null,
    2,
  )

  return { content: [{ type: 'text', text }] }
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Server runs until stdin closes
}

main().catch((err) => {
  console.error('PQSafe MCP server fatal error:', err)
  process.exit(1)
})
