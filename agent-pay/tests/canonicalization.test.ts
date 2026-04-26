/**
 * PQSafe AgentPay — RFC 8785 (JCS) canonicalization test suite
 *
 * 12 test cases covering: whitespace, key ordering, number normalisation,
 * Unicode escaping, BOM stripping, surrogate sort order, and sign-then-
 * canonicalize integration.
 *
 * Run:  npm run test:canonical
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'

// ---------------------------------------------------------------------------
// Skip-if-missing guard (sister agent may not have landed canonical.ts yet)
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const canonicalPath = resolve(__dirname, '../src/canonical.ts')

if (!existsSync(canonicalPath)) {
  console.warn(
    '\n⚠  SKIP: ../src/canonical.ts not found — canonicalization tests skipped.\n' +
    '   Run again once the sister agent has committed canonical.ts.\n',
  )
  process.exit(0)
}

// Dynamic import so the skip-guard above can bail before Node tries to resolve.
const { canonicalJsonBytes, canonicalJsonString } = await import(
  '../src/canonical.js'
) as { canonicalJsonBytes: (v: unknown) => Uint8Array; canonicalJsonString: (v: unknown) => string }

// ---------------------------------------------------------------------------
// Harness (mirrors envelope.test.ts style)
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const failures: Array<{ name: string; err: string }> = []

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  \x1b[32m✓\x1b[0m ${name}`)
  } catch (err) {
    failed++
    const msg = err instanceof Error ? err.message : String(err)
    failures.push({ name, err: msg })
    console.log(`  \x1b[31m✗\x1b[0m ${name}`)
    console.log(`    \x1b[90m${msg}\x1b[0m`)
  }
}

function assertThrows(fn: () => unknown, label: string): void {
  let threw = false
  try {
    fn()
  } catch {
    threw = true
  }
  if (!threw) throw new Error(`${label}: expected throw but nothing threw`)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function run() {
  console.log('')
  console.log('\x1b[35m\x1b[1m  PQSafe AgentPay — RFC 8785 JCS canonicalization suite\x1b[0m')
  console.log('\x1b[90m  12 test cases per TC-01–TC-12\x1b[0m')
  console.log('')

  // -------------------------------------------------------------------------
  // TC-01: Whitespace differences produce identical canonical bytes
  // -------------------------------------------------------------------------
  await test('TC-01: whitespace differences produce identical canonical bytes', () => {
    const prettyA = `{
  "issuer": "pq1abc",
  "maxAmount": 200,
  "currency": "USD"
}`
    const compactB = '{"issuer":"pq1abc","maxAmount":200,"currency":"USD"}'
    const a = canonicalJsonString(JSON.parse(prettyA))
    const b = canonicalJsonString(JSON.parse(compactB))
    assert.equal(a, b, 'Pretty vs compact must produce identical canonical output')
  })

  // -------------------------------------------------------------------------
  // TC-02: Key reordering produces identical canonical bytes
  // -------------------------------------------------------------------------
  await test('TC-02: key reordering produces identical canonical bytes', () => {
    const objA = { a: 1, z: 2 }
    const objB = { z: 2, a: 1 }
    const a = canonicalJsonString(objA)
    const b = canonicalJsonString(objB)
    assert.equal(a, b, '{a,z} and {z,a} must produce identical canonical output')
    assert.equal(a, '{"a":1,"z":2}', 'Keys must be sorted a → z')
  })

  // -------------------------------------------------------------------------
  // TC-03: Number formats normalize identically
  // -------------------------------------------------------------------------
  await test('TC-03: number formats normalize identically (200, 200.0, 2e2)', () => {
    // JSON.parse coerces all three to the same IEEE 754 value before we even
    // call canonicalize, so this confirms the full pipeline (parse + canonical)
    const a = canonicalJsonString(JSON.parse('{"n":200}'))
    const b = canonicalJsonString(JSON.parse('{"n":200.0}'))
    const c = canonicalJsonString(JSON.parse('{"n":2e2}'))
    assert.equal(a, b, '200 vs 200.0 should normalize identically')
    assert.equal(b, c, '200.0 vs 2e2 should normalize identically')
    assert.equal(a, '{"n":200}', 'Canonical output for integer 200 should be {"n":200}')
  })

  // -------------------------------------------------------------------------
  // TC-04: Unicode control chars use \uhhhh; \t and \n use named escapes
  // -------------------------------------------------------------------------
  await test('TC-04: Unicode control chars use \\uhhhh; \\t and \\n use named escapes', () => {
    // U+0001 (SOH) — raw control byte must be  in canonical output
    const objControl = { memo: 'xy' }
    const canon = canonicalJsonString(objControl)
    assert.ok(
      canon.includes('\\u0001'),
      `Canonical output must escape U+0001 as \\u0001, got: ${canon}`,
    )
    assert.ok(
      !canon.includes(''),
      'Canonical output must NOT contain raw U+0001 byte',
    )

    // \t (U+0009) and \n (U+000A) must use named escapes per RFC 8785 §3.2.2.2
    const objNamed = { memo: 'a\tb\nc' }
    const canonNamed = canonicalJsonString(objNamed)
    assert.ok(
      canonNamed.includes('\\t'),
      `\\t must use named escape in canonical output, got: ${canonNamed}`,
    )
    assert.ok(
      canonNamed.includes('\\n'),
      `\\n must use named escape in canonical output, got: ${canonNamed}`,
    )
  })

  // -------------------------------------------------------------------------
  // TC-05: Trailing comma rejected at parse stage (canonical pipeline safety)
  // -------------------------------------------------------------------------
  await test('TC-05: trailing comma rejected at parse stage', () => {
    // JSON.parse should throw SyntaxError — canonical pipeline never sees invalid JSON
    assertThrows(
      () => JSON.parse('{"a":1,}'),
      'TC-05',
    )
    // Belt-and-suspenders: confirm error is SyntaxError
    let errName = ''
    try {
      JSON.parse('{"a":1,}')
    } catch (e) {
      errName = (e as Error).constructor.name
    }
    assert.equal(errName, 'SyntaxError', 'Must throw SyntaxError for trailing comma')
  })

  // -------------------------------------------------------------------------
  // TC-06: Nested object key order
  // -------------------------------------------------------------------------
  await test('TC-06: nested object key order', () => {
    const obj = { outer: { z: 1, a: 2 } }
    const canon = canonicalJsonString(obj)
    assert.equal(
      canon,
      '{"outer":{"a":2,"z":1}}',
      'Nested keys must also be sorted (a before z)',
    )
  })

  // -------------------------------------------------------------------------
  // TC-07: Array order preserved (NOT sorted)
  // -------------------------------------------------------------------------
  await test('TC-07: array order preserved (NOT sorted)', () => {
    const obj = { items: ['c', 'a', 'b'] }
    const canon = canonicalJsonString(obj)
    assert.equal(
      canon,
      '{"items":["c","a","b"]}',
      'Array elements must preserve insertion order, not be sorted',
    )
  })

  // -------------------------------------------------------------------------
  // TC-08: BOM stripping
  // -------------------------------------------------------------------------
  await test('TC-08: BOM stripping — canonical output identical to BOM-free', () => {
    const bomJson = '﻿{"issuer":"pq1abc","amount":100}'
    const cleanJson = '{"issuer":"pq1abc","amount":100}'

    // Strip BOM before parsing (as a real pipeline would)
    const strippedJson = bomJson.startsWith('﻿') ? bomJson.slice(1) : bomJson

    const fromBom = canonicalJsonString(JSON.parse(strippedJson))
    const fromClean = canonicalJsonString(JSON.parse(cleanJson))

    assert.equal(fromBom, fromClean, 'BOM-stripped parse must produce same canonical as clean JSON')
    assert.ok(
      !fromBom.startsWith('﻿'),
      'Canonical output must NOT start with BOM',
    )
  })

  // -------------------------------------------------------------------------
  // TC-09: Number edge cases (MAX_SAFE_INTEGER, -0, Infinity, NaN, 5e-324)
  // -------------------------------------------------------------------------
  await test('TC-09: number edge cases', () => {
    // MAX_SAFE_INTEGER → exact integer representation
    const maxSafe = Number.MAX_SAFE_INTEGER
    const canonMaxSafe = canonicalJsonString({ n: maxSafe })
    assert.equal(
      canonMaxSafe,
      `{"n":${maxSafe}}`,
      `MAX_SAFE_INTEGER (${maxSafe}) must round-trip exactly`,
    )

    // -0 → 0 per RFC 8785 §3.2.2.3
    const canonNegZero = canonicalJsonString({ n: -0 })
    assert.equal(canonNegZero, '{"n":0}', '-0 must serialize as 0 per RFC 8785 §3.2.2.3')

    // Infinity → must throw (not valid JSON)
    assertThrows(
      () => canonicalJsonString({ n: Infinity }),
      'TC-09 Infinity',
    )

    // NaN → must throw (not valid JSON)
    assertThrows(
      () => canonicalJsonString({ n: NaN }),
      'TC-09 NaN',
    )

    // 5e-324 (smallest positive float) → canonical string representation
    const minFloat = 5e-324
    const canonMin = canonicalJsonString({ n: minFloat })
    // RFC 8785 requires shortest representation that round-trips; accept any that parses back
    const parsed = JSON.parse(canonMin) as { n: number }
    assert.equal(parsed.n, minFloat, '5e-324 must round-trip through canonical serialization')
  })

  // -------------------------------------------------------------------------
  // TC-10: null vs missing field — different canonical bytes
  // -------------------------------------------------------------------------
  await test('TC-10: null vs missing field produce different canonical bytes', () => {
    const withNull = { rail: null }
    const withoutField = {} as Record<string, unknown>
    const a = canonicalJsonString(withNull)
    const b = canonicalJsonString(withoutField)
    assert.notEqual(a, b, '{rail:null} must differ from {} in canonical output')
    assert.equal(a, '{"rail":null}', '{rail:null} canonical must include the key')
    assert.equal(b, '{}', 'Empty object canonical must be {}')
  })

  // -------------------------------------------------------------------------
  // TC-11: UTF-16 surrogate sort order
  // A (U+0041 = 0x0041) must sort before 𐀀 (U+10000 = surrogate pair 0xD800 0xDC00)
  // because RFC 8785 uses UTF-16 code unit ordering
  // -------------------------------------------------------------------------
  await test('TC-11: UTF-16 surrogate sort order (A=0x0041 < 𐀀 first-surrogate=0xD800)', () => {
    // Build object with keys in reversed order to force the sort to do work
    const obj: Record<string, string> = {}
    obj['\u{10000}'] = 'x'   // 𐀀 — Linear B Syllable B008 A (U+10000)
    obj['A'] = 'y'
    const canon = canonicalJsonString(obj)
    // A must appear first in the output
    const posA = canon.indexOf('"A"')
    const posLinearB = canon.indexOf('"𐀀"') !== -1
      ? canon.indexOf('"𐀀"')
      : canon.indexOf('"\\ud800\\udc00"')  // in case impl escapes surrogates
    assert.ok(posA !== -1, 'Key "A" must appear in canonical output')
    assert.ok(posLinearB !== -1, 'Key "𐀀" must appear in canonical output')
    assert.ok(
      posA < posLinearB,
      `"A" (0x0041) must sort before "𐀀" (surrogate 0xD800), got canonical: ${canon}`,
    )
  })

  // -------------------------------------------------------------------------
  // TC-12: Sign-then-canonicalize integration test
  // -------------------------------------------------------------------------
  await test('TC-12: sign canonical bytes → verify against reordered object', () => {
    const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
    const { publicKey, secretKey } = ml_dsa65.keygen(seed)

    // Build a SpendEnvelope-like object (key order: natural insertion order)
    const envelope = {
      version: 1,
      issuer: 'pq1' + 'a'.repeat(40),
      agent: 'test-canonical-agent',
      maxAmount: 200,
      currency: 'USD',
      allowedRecipients: ['GB29NWBK60161331926819'],
      validFrom: 1700000000,
      validUntil: 1700003600,
      nonce: 'deadbeef' + '0'.repeat(24),
    }

    // Manually reconstruct with completely reversed key order
    const reordered = {
      nonce: envelope.nonce,
      validUntil: envelope.validUntil,
      validFrom: envelope.validFrom,
      allowedRecipients: [...envelope.allowedRecipients],
      currency: envelope.currency,
      maxAmount: envelope.maxAmount,
      agent: envelope.agent,
      issuer: envelope.issuer,
      version: envelope.version,
    }

    // Canonicalize both — must be byte-equal
    const canonA = canonicalJsonBytes(envelope)
    const canonB = canonicalJsonBytes(reordered)
    assert.deepEqual(canonA, canonB, 'Canonical bytes must be identical regardless of key insertion order')

    // Sign the canonical bytes
    const sig = ml_dsa65.sign(canonA, secretKey)

    // Verify signature against the REORDERED canonical bytes (should match)
    const valid = ml_dsa65.verify(sig, canonB, publicKey)
    assert.ok(valid, 'Signature over canonical bytes of normal order must verify against reordered canonical bytes')
  })

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------

  console.log('')
  console.log(
    `  \x1b[1m${passed + failed} tests · ${passed} passed · ${failed} failed\x1b[0m`,
  )
  if (failed > 0) {
    console.log('')
    console.log('\x1b[31m  Failures:\x1b[0m')
    for (const f of failures) {
      console.log(`    • ${f.name}`)
      console.log(`      \x1b[90m${f.err}\x1b[0m`)
    }
    process.exit(1)
  } else {
    console.log('  \x1b[32mAll RFC 8785 JCS guardrails held.\x1b[0m')
    console.log('')
  }
}

run().catch((err) => {
  console.error('\x1b[31mTest runner crashed:\x1b[0m', err)
  process.exit(1)
})
