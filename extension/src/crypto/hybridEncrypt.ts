import { ml_kem768 } from '@noble/post-quantum/ml-kem.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

/**
 * ML-KEM-768 encapsulates a shared secret for the recipient.
 * We derive an AES-GCM-256 key from it via HKDF and encrypt the message.
 * Output:
 *   kemCt — 1088 bytes, decapsulated by recipient's KEM secret key
 *   iv    — 12 bytes, AES-GCM nonce
 *   ct    — AES-GCM ciphertext of the UTF-8 message
 */
export interface EncryptedMessage {
  version: 1
  suite: 'ml-kem-768+hkdf-sha256+aes-256-gcm'
  kemCt: string
  iv: string
  ct: string
}

const HKDF_INFO = new TextEncoder().encode('pqsafe/v1/message-encryption')

async function keyFromSharedSecret(sharedSecret: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: HKDF_INFO },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptToRecipient(
  recipientKemPubKey: Uint8Array,
  message: string,
): Promise<EncryptedMessage> {
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(recipientKemPubKey)
  const key = await keyFromSharedSecret(sharedSecret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(message),
  )
  return {
    version: 1,
    suite: 'ml-kem-768+hkdf-sha256+aes-256-gcm',
    kemCt: bytesToHex(cipherText),
    iv: bytesToHex(iv),
    ct: bytesToHex(new Uint8Array(ctBuf)),
  }
}

export async function decryptFromSender(
  kemSecretKey: Uint8Array,
  blob: EncryptedMessage,
): Promise<string> {
  if (blob.version !== 1) throw new Error('Unsupported message version')
  const kemCt = hexToBytes(blob.kemCt)
  const iv = hexToBytes(blob.iv)
  const ct = hexToBytes(blob.ct)
  const sharedSecret = ml_kem768.decapsulate(kemCt, kemSecretKey)
  const key = await keyFromSharedSecret(sharedSecret)
  let ptBuf: ArrayBuffer
  try {
    ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  } catch {
    throw new Error('Decryption failed — wrong key or tampered ciphertext')
  }
  return new TextDecoder().decode(ptBuf)
}
