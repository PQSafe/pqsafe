/**
 * cli.test.ts — @pqsafe/cli integration tests (vitest)
 *
 * Signing protocol:
 *   canonical = JCS( spendEnvelope )
 *   signature = ML-DSA-65.sign( canonical, secretKey )
 *   wire      = { envelopeJson, signature, dsaPublicKey }
 *
 * The --api smoke test calls the live Worker. Skip with SKIP_LIVE=true.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Import lib directly (no subprocess)
// ---------------------------------------------------------------------------
import {
  buildEnvelope,
  envelopeCanonicalBytes,
  envelopeCanonicalJson,
  wrapSigned,
  deriveIssuerAddress,
  publicKeyFingerprint,
  bytesToHex,
} from '../src/lib/envelope.js'
import {
  generateKeypair,
  signMessage,
  verifySignature,
  keypairPath,
  ML_DSA65_SIG_BYTES,
  testModeSignature,
} from '../src/lib/signer.js'
import { jcsStringify } from '../src/lib/jcs.js'
import type { SignedEnvelope, SpendEnvelope } from '../src/types.js'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tmpDir: string
let testEnvelopePath: string
let testKeypairName: string
let realSignedPath: string   // signed with real ML-DSA-65

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'pqsafe-cli-test-'))
  testKeypairName = `test_${Date.now()}`
})

afterAll(() => {
  // Clean up test keypair
  try {
    const kpPath = keypairPath(testKeypairName)
    if (existsSync(kpPath)) rmSync(kpPath)
  } catch { /* ignore */ }
  // Clean up tmp dir
  try {
    rmSync(tmpDir, { recursive: true })
  } catch { /* ignore */ }
})

// ---------------------------------------------------------------------------
// JCS canonicalization
// ---------------------------------------------------------------------------

describe('JCS canonicalization', () => {
  it('sorts keys alphabetically (recursive)', () => {
    const input = { z: 1, a: 2, m: { z: 3, a: 4 } }
    const canonical = jcsStringify(input)
    expect(canonical).toBe('{"a":2,"m":{"a":4,"z":3},"z":1}')
  })

  it('produces no whitespace', () => {
    const canonical = jcsStringify({ foo: 'bar', baz: 42 })
    expect(canonical).not.toMatch(/\s/)
  })

  it('handles arrays without reordering elements', () => {
    const canonical = jcsStringify({ arr: [3, 1, 2] })
    expect(canonical).toBe('{"arr":[3,1,2]}')
  })
})

// ---------------------------------------------------------------------------
// Issuer address derivation
// ---------------------------------------------------------------------------

describe('issuer address derivation', () => {
  it('derives pq1 + 40 hex chars from pubkey', () => {
    // Use any 1952-byte public key hex — just test format
    const fakeHex = 'aa'.repeat(1952)
    const addr = deriveIssuerAddress(fakeHex)
    expect(addr).toMatch(/^pq1[0-9a-f]{40}$/)
  })
})

// ---------------------------------------------------------------------------
// Envelope building
// ---------------------------------------------------------------------------

describe('buildEnvelope', () => {
  it('produces a well-formed SpendEnvelope', () => {
    const fakeHex = 'bb'.repeat(1952)
    const issuer = deriveIssuerAddress(fakeHex)

    const envelope = buildEnvelope({
      agentId: 'test-agent',
      issuerAddress: issuer,
      maxAmount: 50,
      currency: 'usd',    // should be uppercased
      allowedRecipients: ['alice', 'bob'],
      ttlSeconds: 7200,
    })

    expect(envelope.version).toBe(1)
    expect(envelope.agent).toBe('test-agent')
    expect(envelope.currency).toBe('USD')
    expect(envelope.maxAmount).toBe(50)
    expect(envelope.allowedRecipients).toHaveLength(2)
    expect(envelope.nonce).toMatch(/^[0-9a-f]{32}$/)
    // TTL = 7200s
    expect(envelope.validUntil - envelope.validFrom).toBe(7200)
  })
})

// ---------------------------------------------------------------------------
// Issue + local verify round-trip (test mode — placeholder sig)
// ---------------------------------------------------------------------------

describe('issue + verify (test mode placeholder)', () => {
  it('produces a valid SignedEnvelope JSON file', () => {
    const fakeHex = 'cc'.repeat(1952)
    const issuer = deriveIssuerAddress(fakeHex)

    const envelope = buildEnvelope({
      agentId: 'foo',
      issuerAddress: issuer,
      maxAmount: 1,
      currency: 'USD',
      allowedRecipients: ['bar'],
    })

    const placeholderSig = testModeSignature()
    const signed = wrapSigned(envelope, placeholderSig, fakeHex)

    testEnvelopePath = join(tmpDir, 'test-envelope.json')
    writeFileSync(testEnvelopePath, JSON.stringify(signed, null, 2), 'utf-8')

    expect(existsSync(testEnvelopePath)).toBe(true)

    const loaded = JSON.parse(readFileSync(testEnvelopePath, 'utf-8')) as SignedEnvelope
    expect(typeof loaded.envelopeJson).toBe('string')
    expect(typeof loaded.signature).toBe('string')
    expect(typeof loaded.dsaPublicKey).toBe('string')
    expect(loaded.signature.startsWith('00')).toBe(true)

    // envelopeJson should be valid JSON containing our payload
    const inner = JSON.parse(loaded.envelopeJson) as SpendEnvelope
    expect(inner.agent).toBe('foo')
    expect(inner.maxAmount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Real ML-DSA-65 sign + verify round-trip
// ---------------------------------------------------------------------------

describe('real ML-DSA-65 sign + verify', () => {
  it('generates a keypair with correct byte sizes', () => {
    const filePath = generateKeypair(testKeypairName)
    expect(existsSync(filePath)).toBe(true)

    const kp = JSON.parse(readFileSync(filePath, 'utf-8'))
    expect(kp.alg).toBe('ML-DSA-65')
    expect(kp.public_hex.length).toBe(1952 * 2)   // 1952 bytes = 3904 hex chars
    expect(kp.secret_hex.length).toBe(4032 * 2)   // 4032 bytes = 8064 hex chars
  })

  it('issues an envelope and verifies it: valid:true', () => {
    const kpPath = keypairPath(testKeypairName)
    const kp = JSON.parse(readFileSync(kpPath, 'utf-8'))
    const issuer = deriveIssuerAddress(kp.public_hex)

    const envelope = buildEnvelope({
      agentId: 'real-agent',
      issuerAddress: issuer,
      maxAmount: 42,
      currency: 'HKD',
      allowedRecipients: ['charlie'],
    })

    // Sign raw canonical JSON bytes (not SHA-256 of them)
    const canonical = envelopeCanonicalBytes(envelope)
    const sig = signMessage(canonical, kp.secret_hex)
    expect(sig.length).toBe(ML_DSA65_SIG_BYTES)  // exactly 3,309 bytes

    const signed = wrapSigned(envelope, bytesToHex(sig), kp.public_hex)

    realSignedPath = join(tmpDir, 'real-envelope.json')
    writeFileSync(realSignedPath, JSON.stringify(signed, null, 2), 'utf-8')

    // Verify: re-encode envelopeJson to bytes (same as what was signed)
    const msgBytes = new TextEncoder().encode(signed.envelopeJson)
    const valid = verifySignature(msgBytes, signed.signature, signed.dsaPublicKey)
    expect(valid).toBe(true)
  })

  it('tampering maxAmount from 42 to 999 → valid:false', () => {
    const raw = JSON.parse(readFileSync(realSignedPath, 'utf-8')) as SignedEnvelope

    // Parse and tamper the inner envelope JSON
    const inner = JSON.parse(raw.envelopeJson) as SpendEnvelope
    inner.maxAmount = 999
    const tamperedEnvelopeJson = JSON.stringify(inner)  // NOT canonical — still tampered

    const tampered: SignedEnvelope = { ...raw, envelopeJson: tamperedEnvelopeJson }
    const msgBytes = new TextEncoder().encode(tampered.envelopeJson)
    const valid = verifySignature(msgBytes, tampered.signature, tampered.dsaPublicKey)
    expect(valid).toBe(false)
  })

  it('tampering signature bytes directly → valid:false', () => {
    const raw = JSON.parse(readFileSync(realSignedPath, 'utf-8')) as SignedEnvelope

    // Flip first byte of signature
    const tamperedSig = 'ff' + raw.signature.slice(2)
    const tampered: SignedEnvelope = { ...raw, signature: tamperedSig }

    const msgBytes = new TextEncoder().encode(tampered.envelopeJson)
    const valid = verifySignature(msgBytes, tampered.signature, tampered.dsaPublicKey)
    expect(valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Live Worker smoke test (skipped if SKIP_LIVE=true)
// ---------------------------------------------------------------------------

describe('API verify (live Worker smoke test)', () => {
  it.skipIf(process.env['SKIP_LIVE'] === 'true')(
    'POST to live Worker returns valid:true',
    async () => {
      // Use existing issuer v1 keypair (or test keypair if v1 unavailable)
      let kp: { public_hex: string; secret_hex: string }
      const v1Path = join(homedir(), '.pqsafe', 'issuer_v1_keypair.json')
      if (existsSync(v1Path)) {
        kp = JSON.parse(readFileSync(v1Path, 'utf-8'))
      } else {
        const kpPath = keypairPath(testKeypairName)
        kp = JSON.parse(readFileSync(kpPath, 'utf-8'))
      }

      const issuer = deriveIssuerAddress(kp.public_hex)
      const envelope = buildEnvelope({
        agentId: 'cli-smoke-test',
        issuerAddress: issuer,
        maxAmount: 1,
        currency: 'USD',
        allowedRecipients: ['smoketest'],
        ttlSeconds: 300,
      })

      // Sign the canonical JSON bytes (same protocol as agent-pay SDK)
      const canonical = envelopeCanonicalBytes(envelope)
      const sig = signMessage(canonical, kp.secret_hex)
      const signed = wrapSigned(envelope, bytesToHex(sig), kp.public_hex)

      const apiUrl =
        process.env['PQSAFE_API_URL'] ??
        'https://pqsafe-api-production.raymond-thu87.workers.dev'

      // The Worker's /v1/mandates/verify requires:
      //   { envelope: base64url(canonicalJsonBytes), signature: hex, dsaPublicKey: hex }
      const canonBytes = new TextEncoder().encode(signed.envelopeJson)
      const b64url = btoa(String.fromCharCode(...Array.from(canonBytes)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

      const res = await fetch(`${apiUrl}/v1/mandates/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          envelope: b64url,
          signature: signed.signature,
          dsaPublicKey: signed.dsaPublicKey,
        }),
      })

      const body = await res.json() as { valid: boolean; reason?: string; error?: unknown }
      console.log('Live Worker response:', JSON.stringify(body))

      // NOTE: If the Worker returns SIGNATURE_INVALID despite a locally-valid
      // signature, this indicates a Worker-side issue (key not registered,
      // different canonicalization, or Worker deployment mismatch).
      // The CLI's local verification is correct — this is an integration smoke test.
      expect(res.ok).toBe(true)
      expect(body.valid).toBe(true)
    },
    30_000
  )
})
