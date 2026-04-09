import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export function deriveAddress(dsaPublicKey: Uint8Array): string {
  const hash = keccak_256(dsaPublicKey)
  return 'pq1' + bytesToHex(hash.slice(0, 20))
}
