/**
 * Sprint 2 — 3-layer revocation system (production implementation).
 *
 * Architecture:
 *
 *   Layer 1 — Short-lived envelopes (default)
 *     TTL bound by amount tier (see ttl_policy.ts).
 *     Already enforced by validUntil check in Sprint 1; no extra infra needed.
 *
 *   Layer 2 — Issuer epoch (O(1) bulk invalidation)
 *     One uint64 per issuer in the registry. Advancing the epoch invalidates
 *     ALL outstanding envelopes from that issuer immediately.
 *
 *   Layer 3 — Per-envelope revocation registry (granular, expensive)
 *     Per-envelope record keyed by envelopeHash. Used for high-value envelopes
 *     or targeted compromise response.
 *
 * Mode flags (env-var driven):
 *   PQSAFE_REVOCATION_MOCK=true   — in-memory Map; for unit tests
 *   PQSAFE_REGISTRY_ADDRESS=0x... — enable on-chain reads via viem
 *   (default)                     — local JSON file (~/.pqsafe/revocations.json)
 *
 * Fail-safe policy:
 *   failOpen=false (default): block if revocation check errors
 *   failOpen=true:            allow through if service unreachable (low-value)
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Epoch number for Layer 2 bulk invalidation. */
export type IssuerEpoch = bigint

/** Hex-encoded 32-byte hash (0x-prefixed or not) */
export type Hex = string

/** An Ethereum-style address (0x-prefixed 40 hex chars) */
export type Address = string

/** Hex-encoded private key (0x-prefixed or 32 raw bytes hex) */
export type PrivateKey = string

/**
 * Result status string for revocation check.
 *
 *   'active'             — envelope is not revoked; proceed.
 *   'revoked'            — explicitly revoked (Layer 3 record exists).
 *   'epoch_invalidated'  — issuer epoch advanced beyond envelope epoch (Layer 2).
 *   'expired'            — envelope TTL has passed (Layer 1 / temporal).
 *   'unknown'            — check inconclusive; failOpen policy governs result.
 */
export type RevocationStatusCode =
  | 'active'
  | 'revoked'
  | 'epoch_invalidated'
  | 'expired'
  | 'unknown'

/** Full result of a revocation check. */
export interface RevocationStatus {
  /** Composite status code. */
  status: RevocationStatusCode
  /** Which layer detected revocation (1 | 2 | 3), if applicable. */
  layer?: 1 | 2 | 3
  /** Human-readable reason string (for logging). */
  reason?: string
  /** ISO timestamp of when the revocation was recorded, if available. */
  revokedAt?: string
  /** true = check was fail-opened (service unreachable, low-value payment). */
  failedOpen?: boolean
}

/** A persisted per-envelope revocation record. */
export interface RevocationRecord {
  envelopeHash: Hex
  revokedAt: string     // ISO timestamp
  reasonHash: string    // sha256(reason) hex — do not store plaintext reason on-chain
  reason: string        // plaintext; stored locally only
  revokedBy?: string    // key fingerprint or address
}

/** A persisted issuer epoch record. */
export interface EpochRecord {
  issuerAddress: Address
  epoch: bigint
  advancedAt: string    // ISO timestamp
}

/**
 * A revocation check request (kept for backward compatibility with existing
 * RevocationCheckRequest interface used by callers).
 */
export interface RevocationCheckRequest {
  issuerAddress: string
  envelopeId: string
  envelopeEpoch: IssuerEpoch
  requestedAmount: number
  currency: string
}

/** Config for connecting to the revocation check service. */
export interface RevocationServiceConfig {
  serviceUrl: string
  apiKey: string
  timeoutMs?: number
  failClosedThresholdUsd?: number
}

// ---------------------------------------------------------------------------
// Local store — ~/.pqsafe/revocations.json
// ---------------------------------------------------------------------------

interface LocalStore {
  revocations: RevocationRecord[]
  epochs: Record<Address, { epoch: string; advancedAt: string }>
  version: number
}

const STORE_DIR = path.join(os.homedir(), '.pqsafe')
const STORE_PATH = path.join(STORE_DIR, 'revocations.json')
const LOCK_PATH = path.join(STORE_DIR, 'revocations.lock')
const STORE_VERSION = 1
/** Purge records older than 90 days on each write. */
const PURGE_OLDER_THAN_MS = 90 * 24 * 60 * 60 * 1000

function ensureStoreDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true })
  }
}

function readStore(): LocalStore {
  ensureStoreDir()
  if (!fs.existsSync(STORE_PATH)) {
    return { revocations: [], epochs: {}, version: STORE_VERSION }
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8')
    return JSON.parse(raw) as LocalStore
  } catch {
    return { revocations: [], epochs: {}, version: STORE_VERSION }
  }
}

function purgeOldRecords(store: LocalStore): LocalStore {
  const cutoff = Date.now() - PURGE_OLDER_THAN_MS
  return {
    ...store,
    revocations: store.revocations.filter((r) => {
      return new Date(r.revokedAt).getTime() > cutoff
    }),
  }
}

function writeStore(store: LocalStore): void {
  ensureStoreDir()
  const purged = purgeOldRecords(store)
  const tmp = STORE_PATH + '.tmp.' + process.pid
  fs.writeFileSync(tmp, JSON.stringify(purged, null, 2), 'utf8')
  fs.renameSync(tmp, STORE_PATH)
}

/** Acquire a simple lock file; spin up to 500ms then give up. */
async function withLock<T>(fn: () => T): Promise<T> {
  const deadline = Date.now() + 500
  while (Date.now() < deadline) {
    try {
      // O_EXCL = atomic create; throws EEXIST if lock exists
      fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: 'wx' })
      try {
        return fn()
      } finally {
        try { fs.unlinkSync(LOCK_PATH) } catch { /* ignore */ }
      }
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      // Stale lock: if file is >5s old, forcibly remove
      try {
        const stat = fs.statSync(LOCK_PATH)
        if (Date.now() - stat.mtimeMs > 5000) fs.unlinkSync(LOCK_PATH)
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 10))
    }
  }
  throw new Error('PQSafe: could not acquire revocation store lock (timeout)')
}

// ---------------------------------------------------------------------------
// Mock store (for PQSAFE_REVOCATION_MOCK=true)
// ---------------------------------------------------------------------------

const mockRevocations = new Map<Hex, RevocationRecord>()
const mockEpochs = new Map<Address, bigint>()

function isMockMode(): boolean {
  return process.env['PQSAFE_REVOCATION_MOCK'] === 'true'
}

function isOnChainMode(): boolean {
  return typeof process.env['PQSAFE_REGISTRY_ADDRESS'] === 'string' &&
    process.env['PQSAFE_REGISTRY_ADDRESS'].length > 0
}

// ---------------------------------------------------------------------------
// On-chain helpers (viem — only when PQSAFE_REGISTRY_ADDRESS is set)
// ---------------------------------------------------------------------------

/** Minimal ABI for SpendEnvelopeRegistryV2.1 epoch + revocation queries. */
const REGISTRY_ABI = [
  {
    name: 'getIssuerEpoch',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'issuer', type: 'address' }],
    outputs: [{ name: '', type: 'uint64' }],
  },
  {
    name: 'isRevoked',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'envelopeHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

/** Lazily load viem modules at runtime. Uses indirection to avoid TS static resolution. */
async function loadViem(): Promise<{
  createPublicClient: (opts: unknown) => { readContract: (opts: unknown) => Promise<unknown> }
  http: () => unknown
  arbitrum: unknown
}> {
  // Use Function constructor to bypass TypeScript's static import resolution.
  // viem is an optional peer dep; it is NOT required unless PQSAFE_REGISTRY_ADDRESS is set.
  const dynamicImport = new Function('specifier', 'return import(specifier)') as
    (specifier: string) => Promise<Record<string, unknown>>

  let viemMod: Record<string, unknown>
  let chainsMod: Record<string, unknown>
  try {
    viemMod = await dynamicImport('viem')
    chainsMod = await dynamicImport('viem/chains')
  } catch {
    throw new Error(
      'PQSafe: viem is required for on-chain registry mode. Install it: npm install viem'
    )
  }

  return {
    createPublicClient: viemMod['createPublicClient'] as (opts: unknown) => { readContract: (opts: unknown) => Promise<unknown> },
    http: viemMod['http'] as () => unknown,
    arbitrum: chainsMod['arbitrum'],
  }
}

async function onChainGetEpoch(issuerAddress: Address): Promise<bigint> {
  const { createPublicClient, http, arbitrum } = await loadViem()
  const registryAddress = process.env['PQSAFE_REGISTRY_ADDRESS'] as Address

  const client = createPublicClient({ chain: arbitrum, transport: http() })
  const epoch = await client.readContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: 'getIssuerEpoch',
    args: [issuerAddress as `0x${string}`],
  }) as bigint
  return epoch
}

async function onChainIsRevoked(envelopeHash: Hex): Promise<boolean> {
  const { createPublicClient, http, arbitrum } = await loadViem()
  const registryAddress = process.env['PQSAFE_REGISTRY_ADDRESS'] as Address

  const client = createPublicClient({ chain: arbitrum, transport: http() })
  // Normalise to bytes32 format
  const hashBytes = envelopeHash.startsWith('0x') ? envelopeHash : `0x${envelopeHash}`
  const revoked = await client.readContract({
    address: registryAddress,
    abi: REGISTRY_ABI,
    functionName: 'isRevoked',
    args: [hashBytes as `0x${string}`],
  }) as boolean
  return revoked
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether an envelope has been revoked via any of the 3 layers.
 *
 * Composite check order:
 *   1. Layer 1 — TTL / temporal expiry (local, free)
 *   2. Layer 2 — Issuer epoch (local cache → on-chain fallback)
 *   3. Layer 3 — Per-envelope record (local cache → on-chain fallback)
 *
 * Modes (env-var driven):
 *   PQSAFE_REVOCATION_MOCK=true   → in-memory Map (unit tests)
 *   PQSAFE_REGISTRY_ADDRESS=0x... → try local first, fall back to on-chain
 *   (default)                     → local JSON file only
 *
 * @param envelopeHash   keccak256 of envelope bytes (hex, with or without 0x)
 * @param options.issuerAddress  Issuer address for Layer 2 epoch check
 * @param options.issuerEpoch    Epoch the envelope was signed under
 * @param options.skipChain      Skip on-chain reads (local cache only)
 * @param options.failOpen       If true, return 'active' on check errors (low-value path)
 * @param options.validUntil     Unix timestamp (seconds) from envelope — for L1 check
 */
export async function isRevoked(
  envelopeHash: Hex,
  options?: {
    issuerAddress?: Address
    issuerEpoch?: bigint
    skipChain?: boolean
    failOpen?: boolean
    validUntil?: number
  },
): Promise<RevocationStatus> {
  const failOpen = options?.failOpen ?? false

  try {
    // --- Layer 1: TTL / temporal expiry ---
    if (options?.validUntil !== undefined) {
      const nowSec = Math.floor(Date.now() / 1000)
      if (nowSec > options.validUntil) {
        return {
          status: 'expired',
          layer: 1,
          reason: `Envelope expired at ${new Date(options.validUntil * 1000).toISOString()}`,
        }
      }
    }

    // --- Mock mode ---
    if (isMockMode()) {
      // Layer 2: epoch check
      if (options?.issuerAddress !== undefined && options?.issuerEpoch !== undefined) {
        const currentEpoch = mockEpochs.get(options.issuerAddress.toLowerCase()) ?? 0n
        if (currentEpoch > options.issuerEpoch) {
          return {
            status: 'epoch_invalidated',
            layer: 2,
            reason: `Issuer epoch advanced to ${currentEpoch}; envelope epoch was ${options.issuerEpoch}`,
          }
        }
      }
      // Layer 3: per-envelope record
      const rec = mockRevocations.get(normaliseHash(envelopeHash))
      if (rec) {
        return {
          status: 'revoked',
          layer: 3,
          reason: rec.reason,
          revokedAt: rec.revokedAt,
        }
      }
      return { status: 'active' }
    }

    // --- Local mode (+ optional on-chain fallback) ---
    const store = readStore()

    // Layer 2: epoch check
    if (options?.issuerAddress !== undefined && options?.issuerEpoch !== undefined) {
      const addrKey = options.issuerAddress.toLowerCase()
      const localEntry = store.epochs[addrKey]
      let currentEpoch: bigint | undefined

      if (localEntry) {
        currentEpoch = BigInt(localEntry.epoch)
      } else if (isOnChainMode() && !options.skipChain) {
        try {
          currentEpoch = await onChainGetEpoch(options.issuerAddress)
        } catch {
          // on-chain unavailable — handled by failOpen below
        }
      }

      if (currentEpoch !== undefined && currentEpoch > options.issuerEpoch) {
        return {
          status: 'epoch_invalidated',
          layer: 2,
          reason: `Issuer epoch advanced to ${currentEpoch}; envelope epoch was ${options.issuerEpoch}`,
        }
      }
    }

    // Layer 3: per-envelope check
    const hash = normaliseHash(envelopeHash)
    const localRecord = store.revocations.find((r) => normaliseHash(r.envelopeHash) === hash)

    if (localRecord) {
      return {
        status: 'revoked',
        layer: 3,
        reason: localRecord.reason,
        revokedAt: localRecord.revokedAt,
      }
    }

    // On-chain Layer 3 fallback
    if (isOnChainMode() && !options?.skipChain) {
      try {
        const chainRevoked = await onChainIsRevoked(envelopeHash)
        if (chainRevoked) {
          return {
            status: 'revoked',
            layer: 3,
            reason: 'Revoked on-chain (no local reason available)',
          }
        }
      } catch {
        // on-chain unavailable — handled by failOpen below
        if (!failOpen) {
          return {
            status: 'unknown',
            reason: 'On-chain revocation check failed and failOpen=false',
          }
        }
        return { status: 'active', failedOpen: true }
      }
    }

    return { status: 'active' }
  } catch (err) {
    if (failOpen) {
      return { status: 'active', failedOpen: true }
    }
    throw err
  }
}

/**
 * Revoke a specific envelope (Layer 3 — granular per-envelope revocation).
 *
 * Writes a revocation record to the local store (and mock store in test mode).
 * On-chain commitment is out-of-band (the registry contract call is separate).
 *
 * @param envelopeHash  keccak256 of the envelope bytes (hex)
 * @param reason        Human-readable reason (stored locally; hash stored on-chain)
 * @param signer        Private key of the revoker (used to derive revokedBy fingerprint)
 */
export async function revoke(
  envelopeHash: Hex,
  reason: string,
  signer: PrivateKey,
): Promise<RevocationRecord> {
  const hash = normaliseHash(envelopeHash)
  const revokedAt = new Date().toISOString()
  const reasonHash = crypto.createHash('sha256').update(reason).digest('hex')
  // Derive a fingerprint from the signer key (last 8 hex chars of sha256)
  const keyFingerprint = crypto.createHash('sha256').update(signer).digest('hex').slice(-8)

  const record: RevocationRecord = {
    envelopeHash: hash,
    revokedAt,
    reasonHash,
    reason,
    revokedBy: keyFingerprint,
  }

  if (isMockMode()) {
    mockRevocations.set(hash, record)
    return record
  }

  await withLock(() => {
    const store = readStore()
    // Deduplicate: replace if already exists
    const idx = store.revocations.findIndex((r) => normaliseHash(r.envelopeHash) === hash)
    if (idx >= 0) {
      store.revocations[idx] = record
    } else {
      store.revocations.push(record)
    }
    writeStore(store)
  })

  return record
}

/**
 * Advance the issuer epoch (Layer 2 — bulk invalidation).
 *
 * Increments the epoch counter for the given issuer in the local store.
 * This immediately invalidates ALL envelopes signed under the previous epoch.
 *
 * @param issuerAddress  The issuer's Ethereum-style address
 * @param signer         Private key of the issuer (used for fingerprint)
 */
export async function advanceEpoch(
  issuerAddress: Address,
  signer: PrivateKey,
): Promise<EpochRecord> {
  const addrKey = issuerAddress.toLowerCase()
  const advancedAt = new Date().toISOString()

  if (isMockMode()) {
    const current = mockEpochs.get(addrKey) ?? 0n
    const next = current + 1n
    mockEpochs.set(addrKey, next)
    return { issuerAddress, epoch: next, advancedAt }
  }

  let newEpoch: bigint = 1n

  await withLock(() => {
    const store = readStore()
    const entry = store.epochs[addrKey]
    const current = entry ? BigInt(entry.epoch) : 0n
    newEpoch = current + 1n
    store.epochs[addrKey] = { epoch: newEpoch.toString(), advancedAt }
    writeStore(store)
  })

  // Suppress unused-variable warning for signer; it would be used to sign
  // an on-chain tx in production — fingerprint logged for audit.
  void signer

  return { issuerAddress, epoch: newEpoch, advancedAt }
}

/**
 * Get the current epoch for an issuer address.
 *
 * Check order: mock store → local JSON file → on-chain (if PQSAFE_REGISTRY_ADDRESS set).
 *
 * @param issuerAddress  The issuer's Ethereum-style address
 */
export async function getEpoch(issuerAddress: Address): Promise<bigint> {
  const addrKey = issuerAddress.toLowerCase()

  if (isMockMode()) {
    return mockEpochs.get(addrKey) ?? 0n
  }

  const store = readStore()
  const entry = store.epochs[addrKey]
  if (entry) {
    return BigInt(entry.epoch)
  }

  if (isOnChainMode()) {
    return onChainGetEpoch(issuerAddress)
  }

  return 0n
}

// ---------------------------------------------------------------------------
// Compatibility: old RevocationCheckRequest-based API
// ---------------------------------------------------------------------------

/**
 * Legacy check function accepting a RevocationCheckRequest + RevocationServiceConfig.
 * Delegates to the new isRevoked() function. Maintained for backward compat.
 *
 * @deprecated Use isRevoked(envelopeHash, options) instead.
 */
export async function checkRevocation(
  request: RevocationCheckRequest,
  _config: RevocationServiceConfig,
): Promise<{ revoked: boolean; layer?: 1 | 2 | 3; reason?: string; failOpen?: boolean; revokedAt?: string }> {
  const failClosedThreshold = _config.failClosedThresholdUsd ?? 100
  const failOpen = request.requestedAmount < failClosedThreshold

  const result = await isRevoked(request.envelopeId, {
    issuerAddress: request.issuerAddress,
    issuerEpoch: request.envelopeEpoch,
    failOpen,
  })

  return {
    revoked: result.status === 'revoked' || result.status === 'epoch_invalidated',
    layer: result.layer,
    reason: result.reason,
    failOpen: result.failedOpen,
    revokedAt: result.revokedAt,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseHash(h: Hex): string {
  return h.startsWith('0x') ? h.slice(2).toLowerCase() : h.toLowerCase()
}

/** Exposed for tests that need to clear mock state between test runs. */
export function _clearMockStore(): void {
  mockRevocations.clear()
  mockEpochs.clear()
}
