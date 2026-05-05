/**
 * keygen — generate a new ML-DSA-65 issuer keypair
 *
 * Usage: pqsafe keygen [--name v2]
 */

import { generateKeypair, keypairPath, ML_DSA65_PK_BYTES } from '../lib/signer.js'
import { publicKeyFingerprint, deriveIssuerAddress, hexToBytes } from '../lib/envelope.js'

export interface KeygenOptions {
  name?: string
}

export async function commandKeygen(opts: KeygenOptions): Promise<void> {
  const name = opts.name ?? 'v1'
  const targetPath = keypairPath(name)

  console.log(`Generating ML-DSA-65 keypair (NIST FIPS 204 Level 3)…`)
  console.log(`  Key name: ${name}`)
  console.log(`  Saving to: ${targetPath}`)
  console.log('')

  let filePath: string
  try {
    filePath = generateKeypair(name)
  } catch (err) {
    console.error(`Error generating keypair: ${(err as Error).message}`)
    process.exit(1)
  }

  // Re-read to confirm and display
  const { readFileSync } = await import('node:fs')
  const kp = JSON.parse(readFileSync(filePath, 'utf-8'))
  const pkBytes = hexToBytes(kp.public_hex)

  console.log(`Keypair generated successfully:`)
  console.log(`  Algorithm:  ML-DSA-65`)
  console.log(`  Public key: ${pkBytes.length} bytes (expected ${ML_DSA65_PK_BYTES})`)
  console.log(`  Issuer:     ${deriveIssuerAddress(kp.public_hex)}`)
  console.log(`  Fingerprint: ${publicKeyFingerprint(kp.public_hex)}`)
  console.log(`  Saved to:   ${filePath}`)
  console.log('')
  console.log(`Security notes:`)
  console.log(`  - File mode set to 0600 (owner read/write only)`)
  console.log(`  - Never commit or share the secret_hex or seed_hex`)
  console.log(`  - The public_hex is safe to share with verifiers`)
  console.log('')
  console.log(`Next step:`)
  console.log(`  pqsafe issue --agent my-agent --max 100 --currency USD --recipients alice,bob`)
}
