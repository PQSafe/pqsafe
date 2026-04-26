/**
 * Sprint 2 — Hierarchical Issuer + Key Rotation type definitions + stubs.
 *
 * IMPLEMENTATION STATUS: Types only. All functions throw 'Sprint 2 — implementation queued'.
 * Full implementation is Sprint 3 (May 19 – Jun 8).
 *
 * Key hierarchy (see design doc §3 for full architecture):
 *
 *   Root Key (HSM-backed in prod)
 *   └── Spend Key 1 (quarterly rotation, signed by root)
 *       └── Agent Subkey A  (agent-scoped, bounded authority)
 *       └── Agent Subkey B
 *   └── Spend Key 2 (next rotation, pre-generated)
 *       └── ...
 *
 * Key types:
 *   - Root key: ML-DSA-87 (highest security, FIPS 204 Level 5). Never touches
 *     the network. Signs spend key certificates only. HSM-backed in prod;
 *     YubiKey or cloud HSM (AWS CloudHSM / Google Cloud KMS) acceptable for v1.
 *   - Spend key: ML-DSA-65 (FIPS 204 Level 3). Rotated quarterly. Signs
 *     individual envelopes. Can be revoked by root key by advancing issuer epoch.
 *   - Agent subkey: ML-DSA-44 (FIPS 204 Level 2). Scoped to a single agent
 *     identity. Bounded: cannot sign envelopes above agentMaxAmount or for
 *     issuers not in agentAllowedIssuers. Derived from spend key.
 *
 * Multi-sig:
 *   For envelopes above MULTISIG_THRESHOLD ($1,000 USD default), require
 *   signatures from 2-of-3 spend keys. The envelope carries an array of
 *   (publicKey, signature) pairs; verifier checks any 2 are valid.
 */

import type { HexString } from '../types.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default threshold above which 2-of-3 multi-sig is required (USD). */
export const MULTISIG_THRESHOLD_USD = 1_000

/** Default spend key rotation interval (seconds). 90 days. */
export const SPEND_KEY_ROTATION_INTERVAL_SEC = 90 * 24 * 60 * 60

// ---------------------------------------------------------------------------
// Key types
// ---------------------------------------------------------------------------

/** ML-DSA parameter set — drives security level and signature size. */
export type MLDSAVariant = 'ml-dsa-44' | 'ml-dsa-65' | 'ml-dsa-87'

/** Common fields shared by all key records. */
export interface KeyRecord {
  /** Unique key ID (UUID v4). Used in certificates and audit logs. */
  keyId: string
  /** ML-DSA variant for this key. */
  variant: MLDSAVariant
  /** Hex-encoded public key bytes. */
  publicKey: HexString
  /** ISO timestamp: when this key was generated. */
  createdAt: string
  /** ISO timestamp: not valid before this time. */
  validFrom: string
  /** ISO timestamp: not valid after this time. */
  validUntil: string
  /** Whether this key has been explicitly revoked (epoch advance or root revocation). */
  revoked: boolean
  /** ISO timestamp of revocation (if revoked = true). */
  revokedAt?: string
}

/**
 * Root key record. The secret key never leaves the HSM.
 * Only the public key and metadata are stored in this record.
 */
export interface RootKeyRecord extends KeyRecord {
  type: 'root'
  variant: 'ml-dsa-87'
  /**
   * PQSafe issuer address derived from this root key.
   * pq1 + keccak256(publicKey)[0:20] as hex.
   */
  issuerAddress: string
  /**
   * HSM provider used in production.
   * 'yubikey' or 'cloud-hsm' acceptable for v1.
   */
  hsmProvider: 'yubikey' | 'aws-cloudhsm' | 'google-cloud-kms' | 'software-dev-only'
}

/**
 * Spend key certificate: issued by root key to a spend key.
 * Carried in the envelope's keyChain field (Sprint 3+).
 * Allows a verifier to check: root_key -> spend_key -> envelope.
 */
export interface SpendKeyCertificate {
  /** The spend key record this certificate is for. */
  spendKeyId: string
  spendKeyPublicKey: HexString
  /** ML-DSA-87 signature by the root key over the canonical cert payload. */
  rootSignature: HexString
  rootKeyId: string
  rootPublicKey: HexString
  issuedAt: string
  validUntil: string
  /** Epoch this spend key was issued under. Must match the issuer's current epoch. */
  epoch: string  // uint64 as decimal string to avoid BigInt JSON issues
}

/**
 * Spend key record: rotated quarterly, signs individual envelopes.
 */
export interface SpendKeyRecord extends KeyRecord {
  type: 'spend'
  variant: 'ml-dsa-65'
  /** Certificate from root key authorizing this spend key. */
  certificate: SpendKeyCertificate
  /** Quarter this key is active (e.g. "2026-Q2"). For human reference only. */
  rotationQuarter: string
}

/**
 * Agent subkey record: scoped to a single agent identity.
 * Signs envelopes on behalf of the agent; bounded by agentMaxAmount.
 */
export interface AgentSubkeyRecord extends KeyRecord {
  type: 'agent'
  variant: 'ml-dsa-44'
  /** Agent identifier this subkey is scoped to. */
  agentId: string
  /** Parent spend key ID that derived this subkey. */
  parentSpendKeyId: string
  /**
   * Maximum amount this subkey can authorize per envelope.
   * Enforced by the hosted issuer service during envelope creation.
   * Verifiers MUST reject envelopes where amount > agentMaxAmount for agent subkeys.
   */
  agentMaxAmount: number
  /** ISO 4217 currencies this subkey is permitted to sign. Empty = all currencies. */
  agentAllowedCurrencies: string[]
  /** Rails this subkey is permitted to sign. Empty = all rails. */
  agentAllowedRails: string[]
}

/** Union of all key record types. */
export type AnyKeyRecord = RootKeyRecord | SpendKeyRecord | AgentSubkeyRecord

/**
 * Full issuer hierarchy: root + active spend keys + agent subkeys.
 * Serialized and stored in the hosted issuer service database.
 */
export interface IssuerHierarchy {
  /** PQSafe issuer address (derived from root key). */
  issuerAddress: string
  /** Root key record (secret never stored here — public key + metadata only). */
  rootKey: RootKeyRecord
  /** All spend key records (active + historical). */
  spendKeys: SpendKeyRecord[]
  /** All agent subkey records. */
  agentSubkeys: AgentSubkeyRecord[]
  /** Current issuer epoch (matches on-chain value). */
  currentEpoch: string  // uint64 as decimal string
  /** ISO timestamp of last epoch advance. */
  lastEpochAdvancedAt?: string
}

// ---------------------------------------------------------------------------
// Stub functions — Sprint 3 implementation queued
// ---------------------------------------------------------------------------

const NOT_IMPL = 'Sprint 2 — implementation queued (Sprint 3: May 19 – Jun 8)'

/**
 * Create a new issuer hierarchy with a fresh root key.
 *
 * Sprint 3 implementation will:
 *   1. Generate ML-DSA-87 root key (in HSM or software-dev-only mode).
 *   2. Derive issuer address from root public key.
 *   3. Generate first spend key (ML-DSA-65) + sign with root → certificate.
 *   4. Store hierarchy in hosted issuer service.
 *   5. Optionally register issuer address on Arbitrum registry.
 *
 * @throws {Error} 'Sprint 2 — implementation queued' until Sprint 3 ships.
 */
export async function createIssuerHierarchy(
  _params: {
    hsmProvider: RootKeyRecord['hsmProvider']
    organizationName: string
    apiKey: string
    serviceUrl: string
  },
): Promise<IssuerHierarchy> {
  throw new Error(NOT_IMPL)
}

/**
 * Rotate the active spend key (advance to next quarterly key).
 *
 * Sprint 3 implementation will:
 *   1. Generate new ML-DSA-65 spend key.
 *   2. Sign new spend key certificate with root key (requires HSM interaction).
 *   3. Advance issuer epoch on-chain (invalidates all envelopes from old epoch).
 *   4. Old spend key remains in hierarchy for historical verification.
 *
 * @throws {Error} 'Sprint 2 — implementation queued' until Sprint 3 ships.
 */
export async function rotateSpendKey(
  _issuerAddress: string,
  _config: { serviceUrl: string; apiKey: string },
): Promise<SpendKeyRecord> {
  throw new Error(NOT_IMPL)
}

/**
 * Create a new agent-scoped subkey with bounded authority.
 *
 * Sprint 3 implementation will:
 *   1. Generate ML-DSA-44 agent subkey.
 *   2. Associate with active spend key + agent identity.
 *   3. Enforce agentMaxAmount <= spendKey's effective limit.
 *   4. Register subkey in hosted issuer service.
 *
 * @throws {Error} 'Sprint 2 — implementation queued' until Sprint 3 ships.
 */
export async function createAgentSubkey(
  _issuerAddress: string,
  _params: {
    agentId: string
    agentMaxAmount: number
    agentAllowedCurrencies?: string[]
    agentAllowedRails?: string[]
    ttlSeconds?: number
  },
  _config: { serviceUrl: string; apiKey: string },
): Promise<AgentSubkeyRecord> {
  throw new Error(NOT_IMPL)
}
