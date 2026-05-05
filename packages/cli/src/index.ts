#!/usr/bin/env node
/**
 * @pqsafe/cli — issuer authoring command-line tool
 *
 * Commands:
 *   pqsafe keygen [--name v2]
 *   pqsafe issue  --agent <id> --max <num> --currency <ccy> --recipients <csv> [opts]
 *   pqsafe verify [--api] <envelope.json>
 *   pqsafe revoke <envelope.json> [--reason "..."]
 *   pqsafe audit  <audit-id>
 */

import { parseArgs } from 'node:util'
import { commandKeygen } from './commands/keygen.js'
import { commandIssue } from './commands/issue.js'
import { commandVerify } from './commands/verify.js'
import { commandRevoke } from './commands/revoke.js'
import { commandAudit } from './commands/audit.js'

const VERSION = '0.1.0'

const HELP = `
pqsafe — ML-DSA-65 SpendEnvelope issuer CLI

USAGE
  pqsafe <command> [options]

COMMANDS
  keygen              Generate a new ML-DSA-65 issuer keypair
  issue               Create and sign a SpendEnvelope
  verify              Verify a SpendEnvelope (local or via API)
  revoke              Revoke a SpendEnvelope via the PQSafe API
  audit               Look up an audit log entry by ID

KEYGEN OPTIONS
  --name <name>       Key name (default: v1). Saved as issuer_<name>_keypair.json

ISSUE OPTIONS
  --agent <id>        Agent identifier (required)
  --max <amount>      Maximum spend amount (required)
  --currency <ccy>    Currency code, e.g. USD (required)
  --recipients <csv>  Comma-separated recipient IDs (required)
  --ttl <seconds>     Envelope validity in seconds (default: 3600)
  --rail <rail>       Payment rail identifier (optional)
  --key <name>        Keypair name to use (default: v1)
  -o <file>           Output path (default: ./pqsafe-envelope-<agent>-<ts>.json)

VERIFY OPTIONS
  --api               POST to https://api.pqsafe.xyz instead of verifying locally
  <file>              Path to envelope JSON file (required)

REVOKE OPTIONS
  <file>              Path to envelope JSON file (required)
  --reason <reason>   Revocation reason (default: manual_revocation)
  Env: REVOKE_API_KEY (required)

AUDIT OPTIONS
  <audit-id>          Audit log entry ID (required)

GLOBAL OPTIONS
  --help, -h          Show this help
  --version, -v       Show version

ENVIRONMENT
  PQSAFE_API_URL      Override API base URL (default: https://api.pqsafe.xyz)
                      e.g. https://pqsafe-api-production.raymond-thu87.workers.dev
  PQSAFE_TEST_MODE    Set to "true" to skip real signatures (placeholder hex)
  REVOKE_API_KEY      Bearer token for revocation API

EXAMPLES
  pqsafe keygen
  pqsafe keygen --name v2
  pqsafe issue --agent travel-bot --max 100 --currency USD --recipients alice,bob
  pqsafe verify ./pqsafe-envelope-travel-bot-1715000000.json
  pqsafe verify --api ./pqsafe-envelope-travel-bot-1715000000.json
  pqsafe revoke ./pqsafe-envelope-travel-bot-1715000000.json --reason agent_compromised
  pqsafe audit evt_abc123
`.trim()

async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(HELP)
    process.exit(0)
  }

  if (argv[0] === '--version' || argv[0] === '-v') {
    console.log(`@pqsafe/cli v${VERSION}`)
    process.exit(0)
  }

  const command = argv[0]
  const rest = argv.slice(1)

  switch (command) {
    case 'keygen':
      await runKeygen(rest)
      break
    case 'issue':
      await runIssue(rest)
      break
    case 'verify':
      await runVerify(rest)
      break
    case 'revoke':
      await runRevoke(rest)
      break
    case 'audit':
      await runAudit(rest)
      break
    default:
      console.error(`Unknown command: ${command}`)
      console.error(`Run "pqsafe --help" for usage.`)
      process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Subcommand parsers
// ---------------------------------------------------------------------------

async function runKeygen(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      name: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
  })
  if (values.help) {
    console.log('Usage: pqsafe keygen [--name <name>]')
    return
  }
  await commandKeygen({ name: values.name })
}

async function runIssue(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      agent: { type: 'string' },
      max: { type: 'string' },
      currency: { type: 'string' },
      recipients: { type: 'string' },
      ttl: { type: 'string' },
      rail: { type: 'string' },
      key: { type: 'string' },
      output: { type: 'string', short: 'o' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: false,
  })

  if (values.help) {
    console.log('Usage: pqsafe issue --agent <id> --max <num> --currency <ccy> --recipients <csv> [opts]')
    return
  }

  const missing: string[] = []
  if (!values.agent) missing.push('--agent')
  if (!values.max) missing.push('--max')
  if (!values.currency) missing.push('--currency')
  if (!values.recipients) missing.push('--recipients')

  if (missing.length > 0) {
    console.error(`Missing required options: ${missing.join(', ')}`)
    console.error('Run "pqsafe issue --help" for usage.')
    process.exit(1)
  }

  const maxAmount = parseFloat(values.max!)
  if (isNaN(maxAmount) || maxAmount <= 0) {
    console.error('--max must be a positive number')
    process.exit(1)
  }

  const ttl = values.ttl ? parseInt(values.ttl, 10) : undefined
  if (ttl !== undefined && (isNaN(ttl) || ttl <= 0)) {
    console.error('--ttl must be a positive integer (seconds)')
    process.exit(1)
  }

  await commandIssue({
    agent: values.agent!,
    max: maxAmount,
    currency: values.currency!,
    recipients: values.recipients!,
    ttl,
    rail: values.rail,
    key: values.key,
    output: values.output,
  })
}

async function runVerify(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      api: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log('Usage: pqsafe verify [--api] <envelope.json>')
    return
  }

  if (positionals.length === 0) {
    console.error('Missing required argument: <envelope.json>')
    process.exit(1)
  }

  await commandVerify({ file: positionals[0], api: values.api })
}

async function runRevoke(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      reason: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log('Usage: pqsafe revoke <envelope.json> [--reason "..."]')
    return
  }

  if (positionals.length === 0) {
    console.error('Missing required argument: <envelope.json>')
    process.exit(1)
  }

  await commandRevoke({ file: positionals[0], reason: values.reason })
}

async function runAudit(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  })

  if (values.help) {
    console.log('Usage: pqsafe audit <audit-id>')
    return
  }

  if (positionals.length === 0) {
    console.error('Missing required argument: <audit-id>')
    process.exit(1)
  }

  await commandAudit({ auditId: positionals[0] })
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((err: unknown) => {
  console.error(`Unexpected error: ${(err as Error).message}`)
  process.exit(1)
})
