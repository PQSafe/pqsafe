/**
 * verify — local or API-backed SpendEnvelope verification
 *
 * Usage:
 *   pqsafe verify <envelope.json>          # local verify only
 *   pqsafe verify --api <envelope.json>    # POST to api.pqsafe.xyz
 *
 * Local verify: re-canonicalize envelopeJson → verify ML-DSA-65 signature
 * API verify:   POST { envelopeJson, signature, dsaPublicKey } to Worker
 */

import { readFileSync } from 'node:fs'
import { verifySignature, isTestMode } from '../lib/signer.js'
import { apiVerify } from '../lib/api.js'
import type { SignedEnvelope, SpendEnvelope } from '../types.js'

export interface VerifyOptions {
  file: string
  api?: boolean
}

export async function commandVerify(opts: VerifyOptions): Promise<void> {
  // --- Load signed envelope ---
  let signed: SignedEnvelope
  try {
    const raw = readFileSync(opts.file, 'utf-8')
    signed = JSON.parse(raw) as SignedEnvelope
  } catch (err) {
    console.error(`Error reading envelope ${opts.file}: ${(err as Error).message}`)
    process.exit(1)
  }

  if (!signed.envelopeJson || !signed.signature || !signed.dsaPublicKey) {
    console.error('Invalid signed envelope: missing envelopeJson, signature, or dsaPublicKey')
    process.exit(1)
  }

  // Parse payload for display
  let payload: SpendEnvelope | null = null
  try {
    payload = JSON.parse(signed.envelopeJson) as SpendEnvelope
  } catch {
    // non-fatal for API verify
  }

  // --- API verify ---
  if (opts.api) {
    console.log(`Verifying via API: ${process.env['PQSAFE_API_URL'] ?? 'https://api.pqsafe.xyz'} …`)
    let result: Awaited<ReturnType<typeof apiVerify>>
    try {
      result = await apiVerify(signed)
    } catch (err) {
      console.error(`API verification failed: ${(err as Error).message}`)
      process.exit(1)
    }

    if (result.valid) {
      console.log('')
      console.log('valid:true (API)')
      if (payload) printPayloadSummary(payload)
      if (result.envelope_id) console.log(`  Mandate ID: ${result.envelope_id}`)
      process.exit(0)
    } else {
      console.log('')
      console.log(`valid:false (API)${result.reason ? ` — ${result.reason}` : ''}`)
      process.exit(1)
    }
  }

  // --- Local verify ---
  const testMode = isTestMode()

  if (testMode) {
    // In test mode, accept placeholder sigs starting with "00"
    const isPlaceholder = signed.signature.startsWith('00')
    if (isPlaceholder) {
      console.log('')
      console.log('valid:true [TEST MODE — placeholder signature accepted]')
      if (payload) printPayloadSummary(payload)
      process.exit(0)
    }
  }

  // Re-encode envelopeJson to bytes for verification
  const msgBytes = new TextEncoder().encode(signed.envelopeJson)

  let valid: boolean
  try {
    valid = verifySignature(msgBytes, signed.signature, signed.dsaPublicKey)
  } catch (err) {
    console.error(`Verification error: ${(err as Error).message}`)
    process.exit(1)
  }

  console.log('')
  if (valid) {
    console.log('valid:true (local ML-DSA-65)')
    if (payload) printPayloadSummary(payload)
    process.exit(0)
  } else {
    console.log('valid:false — signature verification failed')
    console.log('  The envelope may have been tampered with.')
    process.exit(1)
  }
}

function printPayloadSummary(payload: SpendEnvelope): void {
  console.log(`  Agent:      ${payload.agent}`)
  console.log(`  Max:        ${payload.maxAmount} ${payload.currency}`)
  console.log(`  Recipients: ${payload.allowedRecipients.length}`)
  const from = new Date(payload.validFrom * 1000).toISOString()
  const until = new Date(payload.validUntil * 1000).toISOString()
  console.log(`  Valid:      ${from} → ${until}`)
}
