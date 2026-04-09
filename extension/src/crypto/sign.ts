import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'

export function signMessage(secretKey: Uint8Array, message: string): Uint8Array {
  const msgBytes = new TextEncoder().encode(message)
  return ml_dsa65.sign(secretKey, msgBytes)
}

export function verifySignature(
  publicKey: Uint8Array,
  message: string,
  signature: Uint8Array
): boolean {
  const msgBytes = new TextEncoder().encode(message)
  return ml_dsa65.verify(publicKey, msgBytes, signature)
}
