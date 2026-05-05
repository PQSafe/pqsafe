/**
 * signer.ts — ML-DSA-65 sign/verify + keypair loading from ~/.pqsafe/
 *
 * Protocol (matches agent-pay SDK + Worker verifier exactly):
 *   canonical = JCS( spendEnvelope )   ← RFC 8785 JSON Canonicalization Scheme
 *   signature = ML-DSA-65.sign( canonical, secretKey )
 *   verify    = ML-DSA-65.verify( signature, canonical, publicKey )
 *
 * Signature size: 3,309 bytes (ML-DSA-65, NIST FIPS 204 Level 3)
 * Public key size: 1,952 bytes
 *
 * Note: signs raw JCS bytes — NOT SHA-256(JCS). This matches the live Worker.
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa'
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IssuerKeypair } from '../types.js'
import { hexToBytes, bytesToHex } from './envelope.js'

export const PQSAFE_DIR = join(homedir(), '.pqsafe')

/** Expected byte sizes for ML-DSA-65 (NIST FIPS 204 Level 3) */
export const ML_DSA65_SIG_BYTES = 3309
export const ML_DSA65_PK_BYTES = 1952
export const ML_DSA65_SK_BYTES = 4032

/**
 * Generate a new ML-DSA-65 keypair and save it to ~/.pqsafe/.
 *
 * @param name  Key name (default: 'v1'). Saved as issuer_<name>_keypair.json.
 * @param seed  Optional 32-byte seed for deterministic generation.
 * @returns     The saved keypair file path.
 */
export function generateKeypair(name = 'v1', seed?: Uint8Array): string {
  mkdirSync(PQSAFE_DIR, { recursive: true })

  let actualSeed: Uint8Array
  if (seed) {
    if (seed.length !== 32) throw new Error('Seed must be exactly 32 bytes')
    actualSeed = seed
  } else {
    actualSeed = crypto.getRandomValues(new Uint8Array(32))
  }

  // Noble post-quantum: ml_dsa65.keygen(seed) → { secretKey, publicKey }
  const { secretKey, publicKey } = ml_dsa65.keygen(actualSeed)

  if (publicKey.length !== ML_DSA65_PK_BYTES) {
    throw new Error(
      `Unexpected public key size: ${publicKey.length} (expected ${ML_DSA65_PK_BYTES})`
    )
  }
  if (secretKey.length !== ML_DSA65_SK_BYTES) {
    throw new Error(
      `Unexpected secret key size: ${secretKey.length} (expected ${ML_DSA65_SK_BYTES})`
    )
  }

  const keypair: IssuerKeypair = {
    version: name,
    created_at: new Date().toISOString(),
    alg: 'ML-DSA-65',
    public_hex: bytesToHex(publicKey),
    secret_hex: bytesToHex(secretKey),
    seed_hex: bytesToHex(actualSeed),
    note: 'Keep this file secret. Never commit or share the secret_hex or seed_hex.',
  }

  const filePath = keypairPath(name)
  writeFileSync(filePath, JSON.stringify(keypair, null, 2), { encoding: 'utf-8' })
  // Restrict to owner read/write only
  chmodSync(filePath, 0o600)

  return filePath
}

/**
 * Load an issuer keypair from ~/.pqsafe/issuer_<name>_keypair.json.
 *
 * @param name  Key name (default: 'v1').
 */
export function loadKeypair(name = 'v1'): IssuerKeypair {
  const path = keypairPath(name)
  if (!existsSync(path)) {
    throw new Error(
      `Keypair not found: ${path}\n` +
      `Run "pqsafe keygen${name !== 'v1' ? ` --name ${name}` : ''}" to generate one.`
    )
  }

  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch (err) {
    throw new Error(`Cannot read keypair ${path}: ${(err as Error).message}`)
  }

  let kp: IssuerKeypair
  try {
    kp = JSON.parse(raw) as IssuerKeypair
  } catch {
    throw new Error(`Keypair file is not valid JSON: ${path}`)
  }

  if (!kp.public_hex || !kp.secret_hex) {
    throw new Error(`Keypair file missing public_hex or secret_hex: ${path}`)
  }

  return kp
}

/**
 * Sign a message with ML-DSA-65.
 *
 * @param messageBytes  The raw bytes to sign (e.g. JCS canonical bytes of envelope)
 * @param secretKeyHex  Secret key as hex string
 * @returns Signature as Uint8Array (3,309 bytes)
 */
export function signMessage(messageBytes: Uint8Array, secretKeyHex: string): Uint8Array {
  const sk = hexToBytes(secretKeyHex)
  // noble/post-quantum 0.2.x API: sign(secretKey, message) → signature
  const sig = ml_dsa65.sign(sk, messageBytes)

  if (sig.length !== ML_DSA65_SIG_BYTES) {
    throw new Error(
      `ML-DSA-65 signature size mismatch: got ${sig.length}, expected ${ML_DSA65_SIG_BYTES}`
    )
  }

  return sig
}

/**
 * Verify an ML-DSA-65 signature.
 *
 * @param messageBytes  The raw bytes that were signed
 * @param signatureHex  Signature as hex string
 * @param publicKeyHex  Public key as hex string
 * @returns true if valid
 */
export function verifySignature(
  messageBytes: Uint8Array,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    const pk = hexToBytes(publicKeyHex)
    const sig = hexToBytes(signatureHex)
    // noble/post-quantum 0.2.x API: verify(publicKey, message, signature) → boolean
    return ml_dsa65.verify(pk, messageBytes, sig)
  } catch {
    return false
  }
}

/**
 * Resolve the full path to a keypair file.
 */
export function keypairPath(name: string): string {
  return join(PQSAFE_DIR, `issuer_${name}_keypair.json`)
}

/**
 * In test mode, produce a placeholder signature instead of a real one.
 * The placeholder starts with "00" and is padded to the expected hex length.
 */
export function testModeSignature(): string {
  return '00' + '0'.repeat((ML_DSA65_SIG_BYTES - 1) * 2)
}

/**
 * Check if PQSAFE_TEST_MODE is active.
 */
export function isTestMode(): boolean {
  return process.env['PQSAFE_TEST_MODE'] === 'true'
}
