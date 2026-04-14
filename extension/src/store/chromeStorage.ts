import type { PQKeyPair } from '../crypto/keygen'
import type { EncryptedWallet } from '../crypto/walletCrypto'
import { encryptWallet, decryptWallet } from '../crypto/walletCrypto'

const KEY = 'wallet_v2'

export async function hasStoredWallet(): Promise<boolean> {
  const r = await chrome.storage.local.get(KEY)
  return !!r[KEY]
}

export async function getStoredWalletMeta(): Promise<{ address: string } | null> {
  const r = await chrome.storage.local.get(KEY)
  const blob = r[KEY] as EncryptedWallet | undefined
  if (!blob) return null
  return { address: blob.address }
}

export async function getRawEncryptedWallet(): Promise<EncryptedWallet | null> {
  const r = await chrome.storage.local.get(KEY)
  return (r[KEY] as EncryptedWallet) || null
}

export async function saveEncryptedWallet(blob: EncryptedWallet): Promise<void> {
  await chrome.storage.local.set({ [KEY]: blob })
}

export async function saveWallet(kp: PQKeyPair, password: string): Promise<void> {
  const blob = await encryptWallet(kp, password)
  await saveEncryptedWallet(blob)
}

export async function loadWallet(password: string): Promise<PQKeyPair> {
  const r = await chrome.storage.local.get(KEY)
  const blob = r[KEY] as EncryptedWallet | undefined
  if (!blob) throw new Error('No wallet found')
  return decryptWallet(blob, password)
}

export async function clearWallet(): Promise<void> {
  await chrome.storage.local.remove(KEY)
  await chrome.storage.local.remove('wallet')
}
