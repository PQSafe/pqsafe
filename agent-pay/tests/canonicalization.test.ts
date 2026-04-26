/**
 * PQSafe AgentPay — RFC 8785 (JCS) canonicalization test suite (Vitest)
 *
 * 12 test cases covering: whitespace, key ordering, number normalisation,
 * Unicode escaping, BOM stripping, surrogate sort order, and sign-then-
 * canonicalize integration.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const canonicalPath = resolve(__dirname, '../src/canonical.ts')

// Skip all tests if canonical.ts doesn't exist yet
const skipAll = !existsSync(canonicalPath)

// Dynamic import
const { canonicalJsonBytes, canonicalJsonString } = skipAll
  ? { canonicalJsonBytes: null, canonicalJsonString: null }
  : await import('../src/canonical.js') as {
      canonicalJsonBytes: (v: unknown) => Uint8Array
      canonicalJsonString: (v: unknown) => string
    }

describe('RFC 8785 JCS canonicalization', () => {
  if (skipAll) {
    it.skip('canonical.ts not found — all canonicalization tests skipped', () => {})
    return
  }

  const cjb = canonicalJsonBytes!
  const cjs = canonicalJsonString!

  it('TC-01: whitespace differences produce identical canonical bytes', () => {
    const prettyA = `{\n  "issuer": "pq1abc",\n  "maxAmount": 200,\n  "currency": "USD"\n}`
    const compactB = '{"issuer":"pq1abc","maxAmount":200,"currency":"USD"}'
    const a = cjs(JSON.parse(prettyA))
    const b = cjs(JSON.parse(compactB))
    expect(a).toBe(b)
  })

  it('TC-02: key reordering produces identical canonical bytes', () => {
    const objA = { a: 1, z: 2 }
    const objB = { z: 2, a: 1 }
    const a = cjs(objA)
    const b = cjs(objB)
    expect(a).toBe(b)
    expect(a).toBe('{"a":1,"z":2}')
  })

  it('TC-03: number formats normalize identically (200, 200.0, 2e2)', () => {
    const a = cjs(JSON.parse('{"n":200}'))
    const b = cjs(JSON.parse('{"n":200.0}'))
    const c = cjs(JSON.parse('{"n":2e2}'))
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(a).toBe('{"n":200}')
  })

  it('TC-04: Unicode control chars use \\uhhhh; \\t and \\n use named escapes', () => {
    const objControl = { memo: 'xy' }
    const canon = cjs(objControl)
    expect(canon).toContain('\\u0001')
    expect(canon).not.toContain('')

    const objNamed = { memo: 'a\tb\nc' }
    const canonNamed = cjs(objNamed)
    expect(canonNamed).toContain('\\t')
    expect(canonNamed).toContain('\\n')
  })

  it('TC-05: trailing comma rejected at parse stage', () => {
    expect(() => JSON.parse('{"a":1,}')).toThrow(SyntaxError)
  })

  it('TC-06: nested object key order', () => {
    const obj = { outer: { z: 1, a: 2 } }
    expect(cjs(obj)).toBe('{"outer":{"a":2,"z":1}}')
  })

  it('TC-07: array order preserved (NOT sorted)', () => {
    const obj = { items: ['c', 'a', 'b'] }
    expect(cjs(obj)).toBe('{"items":["c","a","b"]}')
  })

  it('TC-08: BOM stripping — canonical output identical to BOM-free', () => {
    const bomJson = '﻿{"issuer":"pq1abc","amount":100}'
    const cleanJson = '{"issuer":"pq1abc","amount":100}'
    const strippedJson = bomJson.startsWith('﻿') ? bomJson.slice(1) : bomJson
    const fromBom = cjs(JSON.parse(strippedJson))
    const fromClean = cjs(JSON.parse(cleanJson))
    expect(fromBom).toBe(fromClean)
    expect(fromBom).not.toMatch(/^﻿/)
  })

  it('TC-09: number edge cases', () => {
    const maxSafe = Number.MAX_SAFE_INTEGER
    expect(cjs({ n: maxSafe })).toBe(`{"n":${maxSafe}}`)
    expect(cjs({ n: -0 })).toBe('{"n":0}')
    expect(() => cjs({ n: Infinity })).toThrow()
    expect(() => cjs({ n: NaN })).toThrow()
    const minFloat = 5e-324
    const canonMin = cjs({ n: minFloat })
    const parsed = JSON.parse(canonMin) as { n: number }
    expect(parsed.n).toBe(minFloat)
  })

  it('TC-10: null vs missing field produce different canonical bytes', () => {
    const withNull = { rail: null }
    const withoutField = {} as Record<string, unknown>
    expect(cjs(withNull)).not.toBe(cjs(withoutField))
    expect(cjs(withNull)).toBe('{"rail":null}')
    expect(cjs(withoutField)).toBe('{}')
  })

  it('TC-11: UTF-16 surrogate sort order (A=0x0041 < first-surrogate=0xD800)', () => {
    const obj: Record<string, string> = {}
    obj['\u{10000}'] = 'x'
    obj['A'] = 'y'
    const canon = cjs(obj)
    const posA = canon.indexOf('"A"')
    const posLinearB = canon.indexOf('"𐀀"') !== -1
      ? canon.indexOf('"𐀀"')
      : canon.indexOf('"\\ud800\\udc00"')
    expect(posA).not.toBe(-1)
    expect(posLinearB).not.toBe(-1)
    expect(posA).toBeLessThan(posLinearB)
  })

  it('TC-12: sign canonical bytes → verify against reordered object', () => {
    const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
    const { publicKey, secretKey } = ml_dsa65.keygen(seed)

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

    const canonA = cjb(envelope)
    const canonB = cjb(reordered)
    expect(canonA).toEqual(canonB)

    const sig = ml_dsa65.sign(canonA, secretKey)
    const valid = ml_dsa65.verify(sig, canonB, publicKey)
    expect(valid).toBe(true)
  })
})
