/**
 * issue — create and sign a SpendEnvelope
 *
 * Usage: pqsafe issue --agent <id> --max <num> --currency <ccy>
 *                     --recipients <csv> [--ttl 3600] [--rail <rail>]
 *                     [--key v1] [-o file.json]
 *
 * Signing protocol (matches Worker/AgentPay SDK):
 *   canonical = JCS( spendEnvelope )
 *   signature = ML-DSA-65.sign( canonical, secretKey )
 *   output    = SignedEnvelope{ envelopeJson, signature, dsaPublicKey }
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildEnvelope,
  envelopeCanonicalBytes,
  envelopeCanonicalJson,
  wrapSigned,
  publicKeyFingerprint,
  deriveIssuerAddress,
  bytesToHex,
} from '../lib/envelope.js'
import {
  loadKeypair,
  signMessage,
  testModeSignature,
  isTestMode,
  ML_DSA65_SIG_BYTES,
} from '../lib/signer.js'

export interface IssueOptions {
  agent: string
  max: number
  currency: string
  recipients: string        // comma-separated
  ttl?: number
  rail?: string
  key?: string              // keypair name, default 'v1'
  output?: string           // -o path
}

export async function commandIssue(opts: IssueOptions): Promise<void> {
  const keyName = opts.key ?? 'v1'
  const testMode = isTestMode()

  if (testMode) {
    console.log('  [TEST MODE] Skipping real signature — using placeholder hex')
  }

  // --- Load keypair ---
  let kp: Awaited<ReturnType<typeof loadKeypair>>
  try {
    kp = loadKeypair(keyName)
  } catch (err) {
    console.error(`Error loading keypair: ${(err as Error).message}`)
    process.exit(1)
  }

  // --- Parse recipients ---
  const recipientList: string[] = opts.recipients
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (recipientList.length === 0) {
    console.error('Error: --recipients must be a non-empty comma-separated list')
    process.exit(1)
  }

  // --- Derive issuer address ---
  const issuerAddress = deriveIssuerAddress(kp.public_hex)

  // --- Build envelope ---
  const envelope = buildEnvelope({
    agentId: opts.agent,
    issuerAddress,
    maxAmount: opts.max,
    currency: opts.currency,
    allowedRecipients: recipientList,
    rail: opts.rail,
    ttlSeconds: opts.ttl ?? 3600,
  })

  const issuedAt = new Date(envelope.validFrom * 1000).toISOString()
  const expiresAt = new Date(envelope.validUntil * 1000).toISOString()

  // --- Sign ---
  let signatureHex: string
  let sigBytes: number

  if (testMode) {
    signatureHex = testModeSignature()
    sigBytes = ML_DSA65_SIG_BYTES
  } else {
    try {
      const canonical = envelopeCanonicalBytes(envelope)
      const sig = signMessage(canonical, kp.secret_hex)
      signatureHex = bytesToHex(sig)
      sigBytes = sig.length
    } catch (err) {
      console.error(`Signing failed: ${(err as Error).message}`)
      process.exit(1)
    }
  }

  // --- Wrap into SignedEnvelope ---
  const signed = wrapSigned(envelope, signatureHex, kp.public_hex)

  // --- Determine output path ---
  const timestamp = Math.floor(Date.now() / 1000)
  const defaultFilename = `pqsafe-envelope-${opts.agent}-${timestamp}.json`
  const outputPath = opts.output ?? join(process.cwd(), defaultFilename)

  // --- Write file ---
  try {
    writeFileSync(outputPath, JSON.stringify(signed, null, 2), 'utf-8')
  } catch (err) {
    console.error(`Error writing envelope: ${(err as Error).message}`)
    process.exit(1)
  }

  // --- Display summary ---
  const fingerprint = publicKeyFingerprint(kp.public_hex)
  const ttlHours = ((opts.ttl ?? 3600) / 3600).toFixed(0)

  console.log('')
  console.log('Issued SpendEnvelope:')
  console.log(`  Agent:      ${envelope.agent}`)
  console.log(`  Issuer:     ${issuerAddress}`)
  console.log(`  Max:        ${envelope.maxAmount} ${envelope.currency}`)
  console.log(`  Recipients: ${recipientList.length} ${recipientList.length === 1 ? 'entry' : 'entries'}`)
  console.log(`  Valid:      ${issuedAt} → ${expiresAt} (${ttlHours}h)`)
  if (testMode) {
    console.log(`  Signature:  ML-DSA-65 (${sigBytes} bytes) [TEST MODE — placeholder]`)
  } else {
    console.log(`  Signature:  ML-DSA-65 (${sigBytes} bytes)`)
  }
  console.log(`  Public key: ${kp.public_hex.slice(0, 16)}… (fingerprint ${fingerprint})`)
  console.log('')
  console.log(`Saved to: ${outputPath}`)
  console.log(`Verify:   pqsafe verify ${outputPath}`)
  console.log(`Revoke:   pqsafe revoke ${outputPath}`)
}
