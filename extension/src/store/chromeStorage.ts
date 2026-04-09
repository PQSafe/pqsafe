import type { PQKeyPair } from '../crypto/keygen'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

interface StoredWallet {
  dsaPublicKey: string
  dsaSecretKey: string
  kemPublicKey: string
  kemSecretKey: string
  address: string
}

export async function saveWallet(kp: PQKeyPair): Promise<void> {
  const data: StoredWallet = {
    dsaPublicKey: bytesToHex(kp.dsa.publicKey),
    dsaSecretKey: bytesToHex(kp.dsa.secretKey),
    kemPublicKey: bytesToHex(kp.kem.publicKey),
    kemSecretKey: bytesToHex(kp.kem.secretKey),
    address: kp.address,
  }
  await chrome.storage.local.set({ wallet: data })
}

export async function loadWallet(): Promise<PQKeyPair | null> {
  const result = await chrome.storage.local.get('wallet')
  if (!result.wallet) return null
  const d = result.wallet as StoredWallet
  return {
    dsa: {
      publicKey: hexToBytes(d.dsaPublicKey),
      secretKey: hexToBytes(d.dsaSecretKey),
    },
    kem: {
      publicKey: hexToBytes(d.kemPublicKey),
      secretKey: hexToBytes(d.kemSecretKey),
    },
    address: d.address,
  }
}

export async function clearWallet(): Promise<void> {
  await chrome.storage.local.remove('wallet')
}
