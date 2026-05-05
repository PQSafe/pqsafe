/**
 * revoke — revoke a SignedEnvelope via the PQSafe API
 *
 * Usage: pqsafe revoke <envelope.json> [--reason "agent_compromised"]
 *
 * Requires env var: REVOKE_API_KEY
 */

import { readFileSync } from 'node:fs'
import { apiRevoke } from '../lib/api.js'
import type { SignedEnvelope, SpendEnvelope } from '../types.js'

export interface RevokeOptions {
  file: string
  reason?: string
}

export async function commandRevoke(opts: RevokeOptions): Promise<void> {
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
    // non-fatal
  }

  const reason = opts.reason ?? 'manual_revocation'

  console.log(`Revoking SpendEnvelope:`)
  if (payload) console.log(`  Agent:  ${payload.agent}`)
  console.log(`  Reason: ${reason}`)
  console.log('')

  let result: Awaited<ReturnType<typeof apiRevoke>>
  try {
    result = await apiRevoke(signed, reason)
  } catch (err) {
    console.error(`Revocation failed: ${(err as Error).message}`)
    process.exit(1)
  }

  if (result.ok) {
    console.log('Revoked successfully')
    if (result.revoked_at) console.log(`  Revoked at: ${result.revoked_at}`)
  } else {
    console.error(`Revocation rejected by API`)
    if (result.reason) console.error(`  Reason: ${result.reason}`)
    process.exit(1)
  }
}
