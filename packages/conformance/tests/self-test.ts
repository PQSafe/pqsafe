/**
 * self-test.ts — sanity checks for the conformance harness itself.
 *
 * Live fixture breakdown (pqsafe.xyz/spec/ap2-pq-test-vectors-v1.json):
 *   6 total vectors
 *   5 runnable (have both jcs_base64url + mldsa_sig_base64url):
 *     - 4 positive  (tc1-minimal, tc2-array-ordering, tc3-decimal, tc4-retention)
 *     - 1 negative  (tc1-neg-tampered-payload — guards against pqcrypto 0.4.0 silent-accept)
 *   1 skipped (tc5-tamper-detection — no ML-DSA sig, requires protocol-level logic)
 *
 * Two trivial mock Verifiers validate runner logic:
 *
 *   alwaysValid:   returns { valid: true }  for every call
 *                  → PASS 4 positive, FAIL 1 negative = 4/5 passed
 *
 *   alwaysInvalid: returns { valid: false } for every call
 *                  → FAIL 4 positive, PASS 1 negative = 1/5 passed
 *
 * These properties exercise the critical invariant: a harness that blindly
 * accepts everything or rejects everything must NOT score 5/5.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  loadFixtures,
  prepareTestCases,
  runConformance,
  formatTap,
  formatJson,
  CANONICAL_FIXTURES_URL,
} from '../src/index.js'
import type { Verifier, PreparedTestCase, TestVectorFile } from '../src/index.js'

// ---------------------------------------------------------------------------
// Mock Verifiers
// ---------------------------------------------------------------------------

const alwaysValid: Verifier = {
  async verify() {
    return { valid: true }
  },
}

const alwaysInvalid: Verifier = {
  async verify() {
    return { valid: false, reason: 'mock: always-invalid' }
  },
}

// ---------------------------------------------------------------------------
// Shared fixture state
// ---------------------------------------------------------------------------

let fixtures: TestVectorFile
let prepared: PreparedTestCase[]

beforeAll(async () => {
  fixtures = await loadFixtures(CANONICAL_FIXTURES_URL)
  prepared = prepareTestCases(fixtures)
}, 30_000)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fixture loading', () => {
  it('loads a non-empty fixture file', () => {
    expect(fixtures).toBeDefined()
    expect(fixtures.test_keys.mldsa_public_key_base64url).toBeTruthy()
    expect(Array.isArray(fixtures.vectors)).toBe(true)
  })

  it('has 5 runnable test cases (from 6 total — 1 skipped)', () => {
    expect(prepared).toHaveLength(5)
  })

  it('has exactly 4 positive test cases', () => {
    const positives = prepared.filter((tc) => tc.expectValid)
    expect(positives).toHaveLength(4)
  })

  it('has exactly 1 negative test case', () => {
    const negatives = prepared.filter((tc) => !tc.expectValid)
    expect(negatives).toHaveLength(1)
  })

  it('negative test case is tc1-neg-tampered-payload', () => {
    const neg = prepared.find((tc) => !tc.expectValid)
    expect(neg!.id).toBe('tc1-neg-tampered-payload')
  })

  it('public key is 1952 bytes (ML-DSA-65 FIPS 204 Level 3)', () => {
    const pk = prepared[0].publicKey
    expect(pk.byteLength).toBe(1952)
  })

  it('each positive-case signature is 3309 bytes', () => {
    const positives = prepared.filter((tc) => tc.expectValid)
    for (const tc of positives) {
      expect(tc.signature.byteLength).toBe(3309)
    }
  })

  it('negative case signature is 3309 bytes', () => {
    const neg = prepared.find((tc) => !tc.expectValid)!
    expect(neg.signature.byteLength).toBe(3309)
  })

  it('report records 1 skipped vector', async () => {
    const report = await runConformance(alwaysValid, {
      fixturesUrl: CANONICAL_FIXTURES_URL,
    })
    expect(report.skipped).toBe(1)
  }, 30_000)
})

describe('alwaysValid mock (accepts everything)', () => {
  it('passes exactly 4 out of 5 runnable tests', async () => {
    const report = await runConformance(alwaysValid, {
      fixturesUrl: CANONICAL_FIXTURES_URL,
    })
    // alwaysValid FAILS the negative test (accepted tampered payload)
    expect(report.total).toBe(5)
    expect(report.passed).toBe(4)
    expect(report.failed).toBe(1)
  }, 30_000)

  it('fails ONLY the negative (tampered-payload) test', async () => {
    const report = await runConformance(alwaysValid, {
      fixturesUrl: CANONICAL_FIXTURES_URL,
    })
    const failed = report.results.filter((r) => !r.passed)
    expect(failed).toHaveLength(1)
    expect(failed[0].expectValid).toBe(false) // it was a negative test
    expect(failed[0].id).toBe('tc1-neg-tampered-payload')
  }, 30_000)

  it('failureReason mentions tampered/silent-accept', async () => {
    const report = await runConformance(alwaysValid, {
      fixturesUrl: CANONICAL_FIXTURES_URL,
    })
    const failed = report.results.filter((r) => !r.passed)
    expect(failed[0].failureReason).toMatch(/tampered|silent-accept/i)
  }, 30_000)
})

describe('alwaysInvalid mock (rejects everything)', () => {
  it('passes exactly 1 out of 5 runnable tests', async () => {
    const report = await runConformance(alwaysInvalid, {
      fixturesUrl: CANONICAL_FIXTURES_URL,
    })
    // alwaysInvalid PASSES the negative test (correctly rejected tampered)
    expect(report.total).toBe(5)
    expect(report.passed).toBe(1)
    expect(report.failed).toBe(4)
  }, 30_000)

  it('passes ONLY the negative (tampered-payload) test', async () => {
    const report = await runConformance(alwaysInvalid, {
      fixturesUrl: CANONICAL_FIXTURES_URL,
    })
    const passed = report.results.filter((r) => r.passed)
    expect(passed).toHaveLength(1)
    expect(passed[0].expectValid).toBe(false) // it was the negative test
    expect(passed[0].id).toBe('tc1-neg-tampered-payload')
  }, 30_000)
})

describe('formatTap output', () => {
  it('starts with TAP version 14', async () => {
    const report = await runConformance(alwaysValid, {
      fixturesUrl: CANONICAL_FIXTURES_URL,
    })
    const tap = formatTap(report)
    expect(tap).toMatch(/^TAP version 14/)
  }, 30_000)

  it('contains plan line 1..5', async () => {
    const report = await runConformance(alwaysValid, {
      fixturesUrl: CANONICAL_FIXTURES_URL,
    })
    const tap = formatTap(report)
    expect(tap).toContain('1..5')
  }, 30_000)

  it('marks failed negative test as "not ok"', async () => {
    const report = await runConformance(alwaysValid, {
      fixturesUrl: CANONICAL_FIXTURES_URL,
    })
    const tap = formatTap(report)
    expect(tap).toMatch(/not ok \d+ - tc1-neg-tampered-payload/)
  }, 30_000)

  it('contains positive ok lines for 4 positive tests', async () => {
    const report = await runConformance(alwaysValid, {
      fixturesUrl: CANONICAL_FIXTURES_URL,
    })
    const tap = formatTap(report)
    const okLines = tap.split('\n').filter((l) => l.startsWith('ok '))
    expect(okLines).toHaveLength(4)
  }, 30_000)
})

describe('formatJson output', () => {
  it('is valid JSON with expected top-level keys', async () => {
    const report = await runConformance(alwaysValid, {
      fixturesUrl: CANONICAL_FIXTURES_URL,
    })
    const json = formatJson(report)
    const parsed = JSON.parse(json)
    expect(parsed).toHaveProperty('timestamp')
    expect(parsed).toHaveProperty('fixturesUrl')
    expect(parsed).toHaveProperty('pubkeyFingerprint')
    expect(parsed).toHaveProperty('total', 5)
    expect(parsed).toHaveProperty('skipped', 1)
    expect(parsed).toHaveProperty('results')
    expect(Array.isArray(parsed.results)).toBe(true)
    expect(parsed.results).toHaveLength(5)
  }, 30_000)
})
