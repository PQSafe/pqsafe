/**
 * runner.ts — fetches the AP2-PQ test vectors and runs them against
 * the caller's Verifier implementation.
 *
 * Supports the live pqsafe.xyz format (vectors array + test_keys object)
 * as well as the legacy local format (test_cases object + top-level pubkey).
 */

import type {
  ConformanceOptions,
  ConformanceReport,
  PreparedTestCase,
  RawVector,
  TestResult,
  TestVectorFile,
  Verifier,
} from './types.js'

/** Default URL for the published AP2-PQ test vectors. */
export const CANONICAL_FIXTURES_URL =
  'https://pqsafe.xyz/spec/ap2-pq-test-vectors-v1.json'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** base64url → Uint8Array (no padding required, handles + vs - and / vs _) */
function fromBase64url(b64url: string): Uint8Array {
  if (!b64url || typeof b64url !== 'string') {
    throw new Error(`Invalid base64url value: ${b64url}`)
  }
  // Convert base64url → standard base64
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  // Add padding if needed
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Fetch JSON from a URL, throwing a descriptive error on failure. */
async function fetchJson(url: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url)
  } catch (err) {
    throw new Error(
      `Failed to fetch test vectors from ${url}: ${(err as Error).message}`
    )
  }
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} fetching test vectors from ${url}`
    )
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the AP2-PQ test-vector file from the given URL.
 * Normalises both the live format (vectors array) and legacy format
 * (test_cases object) into a consistent TestVectorFile shape.
 */
export async function loadFixtures(url: string): Promise<TestVectorFile> {
  const raw = await fetchJson(url) as TestVectorFile

  // Normalise legacy format: if test_cases exists but vectors doesn't,
  // convert test_cases object → vectors array
  if (!raw.vectors && raw.test_cases) {
    raw.vectors = Object.values(raw.test_cases).map((tc) => ({
      ...tc,
      kind: (tc.mldsa_verify === true ? 'positive' : 'negative') as 'positive' | 'negative',
    }))
  }

  // Normalise legacy format: top-level pubkey → test_keys object
  if (!raw.test_keys && raw.mldsa_public_key_base64url) {
    raw.test_keys = {
      mldsa_public_key_base64url: raw.mldsa_public_key_base64url,
    }
  }

  if (!raw.test_keys?.mldsa_public_key_base64url) {
    throw new Error(
      'Fixture file missing test_keys.mldsa_public_key_base64url'
    )
  }
  if (!Array.isArray(raw.vectors) || raw.vectors.length === 0) {
    throw new Error('Fixture file has no test vectors')
  }
  return raw
}

/**
 * Convert a loaded fixture file into a flat list of PreparedTestCases.
 * Skips vectors that lack mldsa_sig_base64url (e.g. tamper-detection
 * vectors that require custom logic outside the Verifier interface).
 *
 * The public key is decoded once and shared across all cases.
 */
export function prepareTestCases(
  fixtures: TestVectorFile
): PreparedTestCase[] {
  const publicKey = fromBase64url(fixtures.test_keys.mldsa_public_key_base64url)

  const cases: PreparedTestCase[] = []
  for (const vec of fixtures.vectors) {
    const raw = vec as RawVector

    // Skip vectors without a JCS payload or ML-DSA signature — they require
    // protocol-level logic outside the scope of the Verifier interface.
    if (!raw.jcs_base64url || !raw.mldsa_sig_base64url) {
      continue
    }

    cases.push({
      id: raw.id,
      description: raw.description,
      expectValid: raw.mldsa_verify === true,
      publicKey,
      message: fromBase64url(raw.jcs_base64url),
      signature: fromBase64url(raw.mldsa_sig_base64url),
    })
  }
  return cases
}

/**
 * Run a single prepared test case against the given Verifier.
 */
async function runOne(
  tc: PreparedTestCase,
  verifier: Verifier
): Promise<TestResult> {
  const start = Date.now()

  let actual: { valid: boolean; reason?: string }
  try {
    actual = await verifier.verify({
      publicKey: tc.publicKey,
      message: tc.message,
      signature: tc.signature,
    })
  } catch (err) {
    actual = {
      valid: false,
      reason: `verifier threw: ${(err as Error).message}`,
    }
  }

  const durationMs = Date.now() - start
  const passed = actual.valid === tc.expectValid

  let failureReason: string | undefined
  if (!passed) {
    if (tc.expectValid) {
      failureReason = `Expected valid=true but got valid=false${actual.reason ? ` (${actual.reason})` : ''}`
    } else {
      // Negative test: verifier accepted a tampered payload — this is the
      // pqcrypto 0.4.0 silent-accept exposure the AP2-PQ spec guards against.
      failureReason =
        `Negative test FAILED: verifier accepted a tampered payload (silent-accept bug). ` +
        `See AP2-PQ spec § negative-vector and pqcrypto 0.4.0 advisory.`
    }
  }

  return {
    id: tc.id,
    description: tc.description,
    expectValid: tc.expectValid,
    passed,
    actual,
    durationMs,
    failureReason,
  }
}

/**
 * Count skipped vectors (those without jcs_base64url + mldsa_sig_base64url).
 */
/**
 * Count skipped vectors: those without both jcs_base64url AND mldsa_sig_base64url.
 * Note: mldsa_neg_skip_reason is an informational note about a known-buggy library
 * (pqcrypto 0.4.0) — we do NOT skip based on it; conformant implementations must
 * still reject the tampered payload.
 */
function countSkipped(fixtures: TestVectorFile): number {
  return fixtures.vectors.filter(
    (v) => !v.jcs_base64url || !v.mldsa_sig_base64url
  ).length
}

/**
 * Derive a short pubkey fingerprint for display.
 * Uses mldsa_pubkey_fingerprint_16 if available, otherwise derives from
 * the first 8 bytes of the base64url-decoded public key.
 */
function pubkeyFingerprint(fixtures: TestVectorFile): string {
  if (fixtures.mldsa_pubkey_fingerprint_16) {
    return fixtures.mldsa_pubkey_fingerprint_16
  }
  try {
    const pk = fromBase64url(fixtures.test_keys.mldsa_public_key_base64url)
    return Array.from(pk.slice(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return 'unknown'
  }
}

/**
 * Main entry point: load fixtures, run all test cases, return a report.
 */
export async function runConformance(
  verifier: Verifier,
  options: ConformanceOptions = {}
): Promise<ConformanceReport> {
  const url = options.fixturesUrl ?? CANONICAL_FIXTURES_URL

  const fixtures = await loadFixtures(url)
  const testCases = prepareTestCases(fixtures)
  const skipped = countSkipped(fixtures)

  const results: TestResult[] = []
  for (const tc of testCases) {
    results.push(await runOne(tc, verifier))
  }

  const passed = results.filter((r) => r.passed).length
  return {
    timestamp: new Date().toISOString(),
    fixturesUrl: url,
    pubkeyFingerprint: pubkeyFingerprint(fixtures),
    total: results.length,
    passed,
    failed: results.length - passed,
    skipped,
    results,
  }
}
