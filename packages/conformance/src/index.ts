/**
 * @pqsafe/conformance
 *
 * Standalone AP2-PQ profile conformance test harness.
 *
 * Any rail integrator (Stripe, Airwallex, Plaid, …) can run this to certify
 * their ML-DSA-65 implementation against the canonical PQSafe test vectors.
 *
 * ML-DSA-65 parameters (NIST FIPS 204 Level 3):
 *   - Public key:  1952 bytes
 *   - Signature:   3309 bytes
 *   - Security:    NIST Level 3 (AES-192 equivalent)
 *
 * Test vectors: https://pqsafe.xyz/spec/ap2-pq-test-vectors-v1.json
 *   6 vectors: 5 positive (tc1–tc5) + 1 negative (tampered-payload,
 *   guards against the pqcrypto 0.4.0 silent-accept exposure)
 */

export { runConformance, loadFixtures, prepareTestCases, CANONICAL_FIXTURES_URL } from './runner.js'
export { formatTap, formatJson, printSummary } from './reporter.js'
export type {
  Verifier,
  ConformanceOptions,
  ConformanceReport,
  TestResult,
  PreparedTestCase,
  RawVector,
  TestVectorFile,
  TestKeys,
} from './types.js'
