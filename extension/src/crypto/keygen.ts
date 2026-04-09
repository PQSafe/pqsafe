import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js'
import { deriveAddress } from './address'

export interface PQKeyPair {
  dsa: {
    publicKey: Uint8Array
    secretKey: Uint8Array
  }
  kem: {
    publicKey: Uint8Array
    secretKey: Uint8Array
  }
  address: string
}

export function generateWallet(): PQKeyPair {
  const dsaSeed = crypto.getRandomValues(new Uint8Array(32))
  const kemSeed = crypto.getRandomValues(new Uint8Array(64))

  const dsaKeys = ml_dsa65.keygen(dsaSeed)
  const kemKeys = ml_kem768.keygen(kemSeed)

  const address = deriveAddress(dsaKeys.publicKey)

  return {
    dsa: { publicKey: dsaKeys.publicKey, secretKey: dsaKeys.secretKey },
    kem: { publicKey: kemKeys.publicKey, secretKey: kemKeys.secretKey },
    address,
  }
}
