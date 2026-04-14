import type { PQKeyPair } from './keygen'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

const PBKDF2_ITERATIONS = 600_000
const KDF_HASH = 'SHA-256'
const SALT_BYTES = 16
const IV_BYTES = 12

export interface EncryptedWallet {
  version: 1
  kdf: 'pbkdf2-sha256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
  address: string
}

interface PlaintextWallet {
  dsaPublicKey: string
  dsaSecretKey: string
  kemPublicKey: string
  kemSecretKey: string
  address: string
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: KDF_HASH },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptWallet(kp: PQKeyPair, password: string): Promise<EncryptedWallet> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)

  const plaintext: PlaintextWallet = {
    dsaPublicKey: bytesToHex(kp.dsa.publicKey),
    dsaSecretKey: bytesToHex(kp.dsa.secretKey),
    kemPublicKey: bytesToHex(kp.kem.publicKey),
    kemSecretKey: bytesToHex(kp.kem.secretKey),
    address: kp.address,
  }
  const plaintextBytes = new TextEncoder().encode(JSON.stringify(plaintext))
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBytes)

  return {
    version: 1,
    kdf: 'pbkdf2-sha256',
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ctBuf)),
    address: kp.address,
  }
}

export async function decryptWallet(blob: EncryptedWallet, password: string): Promise<PQKeyPair> {
  if (blob.version !== 1) throw new Error('Unsupported wallet version')
  const salt = hexToBytes(blob.salt)
  const iv = hexToBytes(blob.iv)
  const ct = hexToBytes(blob.ciphertext)
  const key = await deriveKey(password, salt, blob.iterations)
  let ptBuf: ArrayBuffer
  try {
    ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  } catch {
    throw new Error('Incorrect password')
  }
  const pt = JSON.parse(new TextDecoder().decode(ptBuf)) as PlaintextWallet
  return {
    dsa: {
      publicKey: hexToBytes(pt.dsaPublicKey),
      secretKey: hexToBytes(pt.dsaSecretKey),
    },
    kem: {
      publicKey: hexToBytes(pt.kemPublicKey),
      secretKey: hexToBytes(pt.kemSecretKey),
    },
    address: pt.address,
  }
}
