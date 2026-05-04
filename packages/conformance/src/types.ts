/**
 * @pqsafe/conformance — AP2-PQ profile conformance test suite
 *
 * Types and interfaces for the conformance harness.
 * Implements the AP2-PQ profile as defined in PQSafe spec.
 * Reference: NIST FIPS 204 (ML-DSA-65, Level 3, 3309-byte signature)
 */

/**
 * A Verifier is the unit under test.  Implement this interface for your
 * ML-DSA-65 library, then pass it to runConformance() or the CLI.
 *
 * The AP2-PQ profile mandates ML-DSA-65 (NIST FIPS 204 Level 3):
 *   - publicKey:  1952 bytes
 *   - signature:  3309 bytes
 *   - message:    arbitrary bytes (the JCS-canonicalised mandate payload)
 */
export interface Verifier {
  /** Verify an ML-DSA-65 signature. Returns { valid: bool, reason? } */
  verify(input: {
    publicKey: Uint8Array  // 1952 bytes
    message: Uint8Array    // arbitrary — JCS-canonicalised mandate bytes
    signature: Uint8Array  // 3309 bytes
  }): Promise<{ valid: boolean; reason?: string }>
}

/**
 * One raw test vector entry as returned by the published fixture URL.
 * The live format uses a `vectors` array with a `kind` discriminant.
 */
export interface RawVector {
  kind: 'positive' | 'negative'
  id: string
  description: string
  /** The JCS-canonicalised mandate, base64url-encoded */
  jcs_base64url?: string
  /** ML-DSA-65 signature, base64url-encoded (3309 bytes) */
  mldsa_sig_base64url?: string
  /** Expected ML-DSA-65 verification outcome */
  mldsa_verify?: boolean
  /** Present on negative vectors — describes why/what was tampered */
  tamper_note?: string
  /** For skip-flagged vectors */
  mldsa_neg_skip_reason?: string
}

/** Keys shared across all test cases in the fixture file. */
export interface TestKeys {
  /** ML-DSA-65 public key, base64url-encoded (1952 bytes) */
  mldsa_public_key_base64url: string
  /** Hex of compressed ECDSA P-256 public key (not used by this harness) */
  ecdsa_public_key_compressed_hex?: string
}

/** The root structure of the test-vector JSON at pqsafe.xyz/spec/… */
export interface TestVectorFile {
  version?: string
  generated_at: string
  spec_ref?: string
  license?: string
  algorithm?: {
    pq_scheme: string
    standard: string
    security_category: number
    sig_bytes: number
    pubkey_bytes: number
  }
  test_keys: TestKeys
  vectors: RawVector[]
  // Legacy/local format compatibility
  mldsa_public_key_base64url?: string
  mldsa_pubkey_fingerprint_16?: string
  test_cases?: Record<string, RawVector>
}

/** A single test case prepared for execution by the runner. */
export interface PreparedTestCase {
  /** Unique ID e.g. "tc1-minimal" */
  id: string
  /** Human-readable description */
  description: string
  /** Whether this is a positive (true) or negative (false) test */
  expectValid: boolean
  publicKey: Uint8Array
  message: Uint8Array
  signature: Uint8Array
}

/** Result of running a single test case. */
export interface TestResult {
  id: string
  description: string
  expectValid: boolean
  passed: boolean
  /** Actual result from the Verifier */
  actual: { valid: boolean; reason?: string }
  /** Milliseconds taken */
  durationMs: number
  /** Failure explanation, if any */
  failureReason?: string
}

/** Aggregate result from runConformance(). */
export interface ConformanceReport {
  /** ISO timestamp of the run */
  timestamp: string
  /** URL the fixtures were loaded from */
  fixturesUrl: string
  /** ML-DSA-65 pubkey fingerprint (first 8 bytes hex) from the fixture file */
  pubkeyFingerprint: string
  total: number
  passed: number
  failed: number
  /** How many vectors were skipped (e.g. no ML-DSA sig present) */
  skipped: number
  results: TestResult[]
}

/** Options for runConformance(). */
export interface ConformanceOptions {
  /** URL to fetch test vectors from (default: CANONICAL_FIXTURES_URL) */
  fixturesUrl?: string
}
