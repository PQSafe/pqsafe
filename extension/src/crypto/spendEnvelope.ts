/**
 * Extension-side SpendEnvelope wrapper.
 *
 * Bridges the wallet's PQKeyPair (from keygen.ts / walletCrypto.ts) to the
 * @pqsafe/agent-pay envelope functions. The extension popup or background
 * script calls these helpers — they never expose raw key material to the web.
 *
 * NOTE: @pqsafe/agent-pay is a sibling package in the monorepo.
 * Until it is published to npm, reference it via a relative path in the
 * extension's package.json:
 *   "@pqsafe/agent-pay": "file:../agent-pay"
 */

import { hexToBytes } from '@noble/hashes/utils.js'
import type { PQKeyPair } from './keygen'
import type { Rail } from '../../../agent-pay/src/types.js'
import {
  createEnvelope,
  signEnvelope,
  verifyEnvelope,
  type SpendEnvelope,
  type SignedEnvelope,
  type CreateEnvelopeParams,
} from '../../../agent-pay/src/envelope.js'

export type { SpendEnvelope, SignedEnvelope }

// ---------------------------------------------------------------------------
// Wallet-bound helpers — these require the decrypted PQKeyPair
// ---------------------------------------------------------------------------

export interface WalletEnvelopeParams
  extends Omit<CreateEnvelopeParams, 'issuer'> {
  /** Optional override — defaults to wallet.address */
  issuer?: string
}

/**
 * Create and sign a SpendEnvelope using the wallet's ML-DSA-65 key pair.
 *
 * The caller must have already unlocked the wallet (decryptWallet) and hold
 * the in-memory PQKeyPair. This function does NOT touch storage.
 *
 * @param wallet - Decrypted PQKeyPair from walletCrypto.decryptWallet()
 * @param params - Envelope parameters (agent, maxAmount, recipients, etc.)
 */
export function issueEnvelope(
  wallet: PQKeyPair,
  params: WalletEnvelopeParams,
): SignedEnvelope {
  const envelope = createEnvelope({
    ...params,
    issuer: params.issuer ?? wallet.address,
  })
  return signEnvelope(envelope, wallet.dsa.secretKey, wallet.dsa.publicKey)
}

/**
 * Verify a SignedEnvelope against the wallet's own DSA public key.
 * Returns the parsed SpendEnvelope if valid, throws otherwise.
 *
 * Useful for the extension to confirm envelopes it previously issued
 * are still intact before displaying them in the UI.
 */
export function verifyOwnEnvelope(
  wallet: PQKeyPair,
  signed: SignedEnvelope,
): SpendEnvelope {
  return verifyEnvelope(signed, wallet.dsa.publicKey)
}

/**
 * Verify a SignedEnvelope using only the hex-encoded public key embedded in it.
 * Use this when the wallet is locked (no decrypted keys available) but you need
 * to display envelope details — signature check still runs on the embedded key.
 */
export function verifyEnvelopeFromHex(signed: SignedEnvelope): SpendEnvelope {
  const pubKey = hexToBytes(signed.dsaPublicKey)
  return verifyEnvelope(signed, pubKey)
}

// ---------------------------------------------------------------------------
// Convenience factory — pre-filled defaults for common Raymond ventures
// ---------------------------------------------------------------------------

/**
 * Issue a scoped envelope for a recurring agent operation.
 * Pre-fills sensible defaults for Raymond's typical usage pattern.
 *
 * Example:
 *   const signed = issueVentureEnvelope(wallet, {
 *     agent: 'seniordeli-supplier-bot',
 *     maxAmount: 2000,
 *     currency: 'HKD',
 *     allowedRecipients: ['SUPPLIER_IBAN_HERE'],
 *     ttlSeconds: 7 * 24 * 3600,  // 7 days
 *     rail: 'airwallex',
 *   })
 */
export function issueVentureEnvelope(
  wallet: PQKeyPair,
  params: WalletEnvelopeParams & { rail: Rail },
): SignedEnvelope {
  return issueEnvelope(wallet, {
    startsInSeconds: 0,
    ttlSeconds: 3600,
    ...params,
  })
}
