#!/usr/bin/env node
/**
 * pqsafe-admin — CLI for revocation and epoch management.
 *
 * Commands:
 *   pqsafe-admin revoke <envelope-hash> --reason "..."
 *     Revoke a specific envelope (Layer 3 per-envelope revocation).
 *
 *   pqsafe-admin advance-epoch --issuer <address>
 *     Advance the issuer epoch, bulk-invalidating all outstanding envelopes.
 *
 *   pqsafe-admin get-epoch --issuer <address>
 *     Query the current epoch for an issuer.
 *
 *   pqsafe-admin status <envelope-hash>
 *     Check the revocation status of an envelope.
 *
 * Configuration via environment variables:
 *   PQSAFE_ADMIN_KEY        — admin private key (required for write ops)
 *   PQSAFE_REGISTRY_ADDRESS — on-chain registry contract address
 *   PQSAFE_REVOCATION_MOCK  — use in-memory mock store (testing only)
 */

import {
  isRevoked,
  revoke,
  advanceEpoch,
  getEpoch,
} from '../sprint2/revocation.js'

// ---------------------------------------------------------------------------
// Argument parsing (no external deps — keep CLI self-contained)
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  command: string
  positional: string[]
  flags: Record<string, string>
} {
  const args = argv.slice(2) // strip node + script
  const positional: string[] = []
  const flags: Record<string, string> = {}

  let i = 0
  while (i < args.length) {
    const arg = args[i]
    if (arg === undefined) break
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i += 2
      } else {
        flags[key] = 'true'
        i++
      }
    } else {
      positional.push(arg)
      i++
    }
  }

  return {
    command: positional[0] ?? '',
    positional: positional.slice(1),
    flags,
  }
}

function die(msg: string): never {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}

function requireFlag(flags: Record<string, string>, name: string): string {
  const val = flags[name]
  if (!val) die(`--${name} is required`)
  return val
}

function requireAdminKey(): string {
  const key = process.env['PQSAFE_ADMIN_KEY']
  if (!key) die('PQSAFE_ADMIN_KEY environment variable is required for write operations')
  return key
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function cmdRevoke(positional: string[], flags: Record<string, string>): Promise<void> {
  const envelopeHash = positional[0]
  if (!envelopeHash) die('Usage: pqsafe-admin revoke <envelope-hash> --reason "..."')

  const reason = requireFlag(flags, 'reason')
  const signer = requireAdminKey()

  console.log(`Revoking envelope ${envelopeHash}...`)
  const record = await revoke(envelopeHash, reason, signer)
  console.log('Revocation recorded:')
  console.log(JSON.stringify({ ...record, revokedBy: '[redacted]' }, null, 2))
}

async function cmdAdvanceEpoch(flags: Record<string, string>): Promise<void> {
  const issuer = requireFlag(flags, 'issuer')
  const signer = requireAdminKey()

  console.log(`Advancing epoch for issuer ${issuer}...`)
  const epochRecord = await advanceEpoch(issuer, signer)
  console.log('Epoch advanced:')
  console.log(JSON.stringify({ ...epochRecord, epoch: epochRecord.epoch.toString() }, null, 2))
}

async function cmdGetEpoch(flags: Record<string, string>): Promise<void> {
  const issuer = requireFlag(flags, 'issuer')

  const epoch = await getEpoch(issuer)
  console.log(`Current epoch for ${issuer}: ${epoch.toString()}`)
}

async function cmdStatus(positional: string[]): Promise<void> {
  const envelopeHash = positional[0]
  if (!envelopeHash) die('Usage: pqsafe-admin status <envelope-hash>')

  console.log(`Checking revocation status for ${envelopeHash}...`)
  const status = await isRevoked(envelopeHash, { failOpen: false })
  console.log('Status:')
  console.log(JSON.stringify(status, null, 2))

  if (status.status !== 'active') {
    process.exit(1)
  }
}

function printHelp(): void {
  console.log(`
pqsafe-admin — PQSafe revocation & epoch admin CLI

Commands:
  revoke <hash> --reason "..."      Revoke an envelope (Layer 3)
  advance-epoch --issuer <addr>     Advance issuer epoch (Layer 2 bulk revoke)
  get-epoch --issuer <addr>         Query current issuer epoch
  status <hash>                     Check envelope revocation status

Environment:
  PQSAFE_ADMIN_KEY          Admin private key (write operations)
  PQSAFE_REGISTRY_ADDRESS   On-chain registry contract address
  PQSAFE_REVOCATION_MOCK    Set to 'true' to use in-memory store (testing)
`.trim())
}

// ---------------------------------------------------------------------------
// Main entry point (exported for testability)
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv)

  switch (command) {
    case 'revoke':
      await cmdRevoke(positional, flags)
      break
    case 'advance-epoch':
      await cmdAdvanceEpoch(flags)
      break
    case 'get-epoch':
      await cmdGetEpoch(flags)
      break
    case 'status':
      await cmdStatus(positional)
      break
    case 'help':
    case '--help':
    case '-h':
    case '':
      printHelp()
      break
    default:
      console.error(`Unknown command: ${command}`)
      printHelp()
      process.exit(1)
  }
}

// Export command handlers for unit testing
export { cmdRevoke, cmdAdvanceEpoch, cmdGetEpoch, cmdStatus, parseArgs, printHelp }

// Only invoke when run directly as a script
const isMain = process.argv[1] !== undefined && (
  import.meta.url === new URL(process.argv[1], 'file:').href ||
  process.argv[1].endsWith('/admin.js') ||
  process.argv[1].endsWith('/admin.ts')
)

if (isMain) {
  main().catch((err) => {
    console.error('Fatal:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
