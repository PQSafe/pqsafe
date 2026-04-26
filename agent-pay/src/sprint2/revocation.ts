/**
 * Sprint 2 — 3-layer revocation type definitions + stub functions.
 *
 * IMPLEMENTATION STATUS: Types only. All functions throw 'Sprint 2 — implementation queued'.
 * Full implementation is Sprint 3 (May 19 – Jun 8).
 *
 * Architecture summary (see design doc §2 for full spec):
 *
 *   Layer 1 — Short-lived envelopes (default 1h TTL)
 *     Reduces reliance on revocation for most use cases.
 *     Already enforced by Sprint 1 validUntil check.
 *     No additional infrastructure required.
 *
 *   Layer 2 — Issuer epoch (on-chain, O(1) bulk invalidation)
 *     One uint64 per issuer address on Arbitrum registry.
 *     Envelope carries epoch it was signed under.
 *     Advancing epoch invalidates ALL envelopes from that issuer immediately.
 *     Cost: one on-chain write (~$0.001 on Arbitrum).
 *     Latency: ~2–4 block confirms (~2 sec Arbitrum, ~12 sec Ethereum).
 *
 *   Layer 3 — Per-envelope registry (granular, expensive, used sparingly)
 *     On-chain bit flip per envelopeId.
 *     Use for high-value envelopes or targeted compromise response.
 *     Consumers check this only when envelope.maxAmount > GRANULAR_REVOCATION_THRESHOLD.
 *
 * Fail-safe policy (see composite table in design doc §2.4):
 *   - Amount < $100:  fail-open  (proceed if revocation service unreachable)
 *   - Amount $100–1K: fail-closed (block if revocation service unreachable after 500ms)
 *   - Amount > $1K:   fail-closed + require L3 check + optional 2-of-3 multi-sig
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Epoch number for Layer 2 bulk invalidation. */
export type IssuerEpoch = bigint

/**
 * A revocation check request. The verifier assembles this from the envelope
 * and passes it to checkRevocation().
 */
export interface RevocationCheckRequest {
  /** PQSafe issuer address (pq1 + 40 hex) */
  issuerAddress: string
  /** keccak256(envelopeJson) — the on-chain primary key */
  envelopeId: string
  /** Epoch the envelope was signed under (carried in SpendEnvelope.issuerEpoch, Sprint 3+) */
  envelopeEpoch: IssuerEpoch
  /** Amount of the requested payment — drives fail-safe threshold selection */
  requestedAmount: number
  /** ISO 4217 currency */
  currency: string
}

/** Result of a revocation check. */
export interface RevocationStatus {
  /** true = envelope is revoked and payment must be blocked */
  revoked: boolean
  /** Which layer detected the revocation (or undefined if not revoked) */
  layer?: 1 | 2 | 3
  /** Human-readable reason (for logging, not user-display) */
  reason?: string
  /** true = check was skipped due to fail-open policy (low-value payment + service down) */
  failOpen?: boolean
  /** ISO timestamp of when the revocation was recorded (if available) */
  revokedAt?: string
}

/** Revocation record stored in the hosted issuer service. */
export interface RevocationRecord {
  envelopeId: string
  issuerAddress: string
  revokedAt: string
  revokedBy: string   // API key or root key fingerprint
  reason: string
  layer: 2 | 3
}

/** Config for connecting to the revocation check service. */
export interface RevocationServiceConfig {
  /** Hosted issuer service base URL, e.g. https://api.pqsafe.xyz */
  serviceUrl: string
  /** API key (pq_live_... or pq_test_...) */
  apiKey: string
  /** Timeout in ms before applying fail-safe policy. Default 500ms. */
  timeoutMs?: number
  /** Amount threshold (in USD equivalent) above which fail-closed applies. Default $100. */
  failClosedThresholdUsd?: number
}

// ---------------------------------------------------------------------------
// Stub functions — Sprint 3 implementation queued
// ---------------------------------------------------------------------------

const NOT_IMPL = 'Sprint 2 — implementation queued (Sprint 3: May 19 – Jun 8)'

/**
 * Check whether a SpendEnvelope has been revoked via any of the 3 layers.
 *
 * Sprint 3 implementation will:
 *   1. Check Layer 2 (epoch): compare envelope.issuerEpoch against on-chain current epoch.
 *      Fast path — cached per-issuer, invalidated by epoch-change events.
 *   2. If amount >= config.failClosedThresholdUsd, check Layer 3 (per-envelope registry).
 *   3. Apply fail-safe policy based on amount if the service is unreachable.
 *
 * @throws {Error} 'Sprint 2 — implementation queued' until Sprint 3 ships.
 */
export async function isRevoked(
  _request: RevocationCheckRequest,
  _config: RevocationServiceConfig,
): Promise<RevocationStatus> {
  throw new Error(NOT_IMPL)
}

/**
 * Revoke a specific envelope (Layer 3 — granular per-envelope revocation).
 *
 * Sprint 3 implementation will:
 *   1. POST /v1/issuers/:id/revocations with envelopeId + reason.
 *   2. Hosted service writes revocation record to Postgres + triggers on-chain bit flip.
 *   3. Returns the revocation record with confirmation.
 *
 * @throws {Error} 'Sprint 2 — implementation queued' until Sprint 3 ships.
 */
export async function revoke(
  _envelopeId: string,
  _reason: string,
  _config: RevocationServiceConfig,
): Promise<RevocationRecord> {
  throw new Error(NOT_IMPL)
}

/**
 * Advance the issuer epoch (Layer 2 — bulk invalidation).
 *
 * Advancing the epoch invalidates ALL envelopes signed under the current epoch
 * for this issuer. Use in response to key compromise, agent misbehavior, or
 * as a routine rotation event.
 *
 * Sprint 3 implementation will:
 *   1. POST /v1/issuers/:id/epoch/advance (requires root key or spend key auth).
 *   2. Hosted service atomically increments the epoch counter.
 *   3. Triggers on-chain epoch write to Arbitrum registry (audit anchor).
 *   4. All verifiers revalidating envelopes will see the new epoch and reject old ones.
 *
 * @returns The new epoch number.
 * @throws {Error} 'Sprint 2 — implementation queued' until Sprint 3 ships.
 */
export async function advanceEpoch(
  _issuerAddress: string,
  _config: RevocationServiceConfig,
): Promise<IssuerEpoch> {
  throw new Error(NOT_IMPL)
}

/**
 * Get the current epoch for an issuer address.
 *
 * Sprint 3 implementation will check:
 *   1. Cache (TTL 30s) — served from hosted issuer service.
 *   2. On cache miss: direct Arbitrum eth_call to the registry contract.
 *
 * @throws {Error} 'Sprint 2 — implementation queued' until Sprint 3 ships.
 */
export async function getEpoch(
  _issuerAddress: string,
  _config: Pick<RevocationServiceConfig, 'serviceUrl' | 'apiKey'>,
): Promise<IssuerEpoch> {
  throw new Error(NOT_IMPL)
}
