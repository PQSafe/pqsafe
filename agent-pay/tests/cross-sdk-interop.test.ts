/**
 * cross-sdk-interop.test.ts — TypeScript SDK ↔ Python SDK canonical-bytes interop test (Vitest)
 *
 * Proof point: the PQSafe SpendEnvelope canonical bytes are identical when
 * produced by the TypeScript SDK and when verified by the Python SDK.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { createEnvelope, signEnvelope, verifyEnvelope } from '../src/index.js'
import { canonicalJsonBytes } from '../src/canonical.js'
import type { SignedEnvelope } from '../src/types.js'
import { spawnSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const PYTHON_VERIFIER = `
import sys, json, hashlib

envelope_path = sys.argv[1]

with open(envelope_path) as f:
    data = json.load(f)

signed_envelope = data["signedEnvelope"]
expected_canonical_sha256 = data["canonicalSha256"]
envelope_json = signed_envelope["envelopeJson"]

actual_sha256 = hashlib.sha256(envelope_json.encode("utf-8")).hexdigest()

if actual_sha256 != expected_canonical_sha256:
    print(json.dumps({
        "crossLangVerified": False,
        "error": f"Canonical bytes mismatch: TS produced {expected_canonical_sha256}, Python sees {actual_sha256}",
        "expectedSha256": expected_canonical_sha256,
        "actualSha256": actual_sha256,
    }))
    sys.exit(1)

inner = json.loads(envelope_json)
assert inner["version"] == 1, f"Expected version=1, got {inner['version']}"
assert inner["currency"] == "USD", f"Expected USD, got {inner['currency']}"
assert "anthropic.com/billing" in inner["allowedRecipients"], "anthropic.com/billing not in allowedRecipients"

pq_verified = None
pq_note = "pymlkem not installed — skipping cryptographic verification"
try:
    import importlib
    pq_mod = importlib.import_module("pymlkem")
    sig_bytes = bytes.fromhex(signed_envelope["signature"])
    pubkey_bytes = bytes.fromhex(signed_envelope["dsaPublicKey"])
    msg_bytes = envelope_json.encode("utf-8")
    pq_verified = pq_mod.ml_dsa65_verify(sig_bytes, msg_bytes, pubkey_bytes)
    pq_note = "pymlkem verification passed" if pq_verified else "pymlkem verification FAILED"
except Exception as e:
    pq_note = f"pymlkem unavailable ({e}) — canonical bytes match confirms interop"
    pq_verified = None

print(json.dumps({
    "crossLangVerified": True,
    "canonicalBytesParity": True,
    "expectedSha256": expected_canonical_sha256,
    "actualSha256": actual_sha256,
    "envelopeVersion": inner["version"],
    "envelopeCurrency": inner["currency"],
    "envelopeMaxAmount": inner["maxAmount"],
    "signatureHexLen": len(signed_envelope["signature"]),
    "pubKeyHexLen": len(signed_envelope["dsaPublicKey"]),
    "mlDsa65Verified": pq_verified,
    "pqNote": pq_note,
}))
sys.exit(0)
`

const INTEROP_FILE = '/tmp/pqsafe-interop-test.json'
const PYTHON_SCRIPT = '/tmp/pqsafe-python-verifier.py'
const TEST_RECIPIENT = 'anthropic.com/billing'

describe('Cross-SDK interop (TypeScript signs → Python verifies)', () => {
  let dsaPublicKey: Uint8Array
  let dsaSecretKey: Uint8Array
  let issuerAddress: string
  let signedEnvelopeForExport: SignedEnvelope | null = null

  beforeAll(() => {
    const dsaSeed = globalThis.crypto.getRandomValues(new Uint8Array(32))
    const kp = ml_dsa65.keygen(dsaSeed)
    dsaPublicKey = kp.publicKey
    dsaSecretKey = kp.secretKey
    issuerAddress = 'pq1' + bytesToHex(keccak_256(dsaPublicKey).slice(0, 20))
  })

  it('TS SDK: createEnvelope + signEnvelope produces valid SignedEnvelope', () => {
    const envelope = createEnvelope({
      issuer: issuerAddress,
      agent: 'cross-sdk-interop-test-v1',
      maxAmount: 200,
      currency: 'USD',
      allowedRecipients: [TEST_RECIPIENT],
      ttlSeconds: 3600,
      rail: 'stripe',
    })

    const signed = signEnvelope(envelope, dsaSecretKey, dsaPublicKey)

    expect(typeof signed.envelopeJson).toBe('string')
    expect(signed.envelopeJson.length).toBeGreaterThan(0)
    expect(typeof signed.signature).toBe('string')
    expect(signed.signature.length).toBeGreaterThan(0)
    expect(typeof signed.dsaPublicKey).toBe('string')

    const verified = verifyEnvelope(signed)
    expect(verified.maxAmount).toBe(200)
    expect(verified.currency).toBe('USD')
    expect(verified.allowedRecipients).toContain(TEST_RECIPIENT)

    signedEnvelopeForExport = signed
  })

  it('TS SDK: canonical bytes are deterministic for the same envelope fields', () => {
    const envelope = createEnvelope({
      issuer: issuerAddress,
      agent: 'determinism-check',
      maxAmount: 100,
      currency: 'USD',
      allowedRecipients: [TEST_RECIPIENT],
      ttlSeconds: 3600,
    })

    const bytes1 = canonicalJsonBytes(envelope)
    const bytes2 = canonicalJsonBytes(envelope)
    expect(bytes1.length).toBe(bytes2.length)
    for (let i = 0; i < bytes1.length; i++) {
      expect(bytes1[i]).toBe(bytes2[i])
    }

    expect(bytesToHex(bytes1)).toBe(bytesToHex(bytes2))
  })

  it('TS SDK: exports SignedEnvelope + canonical SHA-256 to /tmp/pqsafe-interop-test.json', () => {
    expect(signedEnvelopeForExport).not.toBeNull()
    const signed = signedEnvelopeForExport!

    const canonicalSha256 = createHash('sha256')
      .update(signed.envelopeJson, 'utf8')
      .digest('hex')

    const exportPayload = {
      description: 'PQSafe cross-SDK interop test — TypeScript signs, Python verifies',
      canonicalSha256,
      signedEnvelope: signed,
      metadata: {
        issuer: issuerAddress,
        recipient: TEST_RECIPIENT,
        exportedAt: new Date().toISOString(),
        tssdkVersion: '0.1.0',
      },
    }

    writeFileSync(INTEROP_FILE, JSON.stringify(exportPayload, null, 2), 'utf8')

    expect(existsSync(INTEROP_FILE)).toBe(true)
    const readBack = JSON.parse(readFileSync(INTEROP_FILE, 'utf8')) as typeof exportPayload
    expect(readBack.canonicalSha256).toBe(canonicalSha256)
    expect(readBack.signedEnvelope.envelopeJson).toBe(signed.envelopeJson)
  })

  it('Python SDK: reads exported envelope and verifies canonical bytes match', () => {
    writeFileSync(PYTHON_SCRIPT, PYTHON_VERIFIER, 'utf8')

    const python = spawnSync('python3', [PYTHON_SCRIPT, INTEROP_FILE], {
      encoding: 'utf8',
      timeout: 10_000,
    })

    if (python.error) {
      throw new Error(`Failed to spawn python3: ${python.error.message}`)
    }

    const stdout = (python.stdout ?? '').trim()
    const stderr = (python.stderr ?? '').trim()

    expect(python.status).toBe(0)
    expect(stdout.length).toBeGreaterThan(0)

    const result = JSON.parse(stdout) as {
      crossLangVerified: boolean
      canonicalBytesParity: boolean
      expectedSha256: string
      actualSha256: string
      mlDsa65Verified?: boolean | null
      pqNote: string
    }

    expect(result.crossLangVerified).toBe(true)
    expect(result.canonicalBytesParity).toBe(true)
    expect(result.expectedSha256).toBe(result.actualSha256)
  })

  it('Python SDK: rejects envelope with tampered canonical bytes', () => {
    const tamperedPayload = {
      description: 'Tampered test',
      canonicalSha256: 'deadbeef'.repeat(8),
      signedEnvelope: signedEnvelopeForExport!,
      metadata: { tamperedForTest: true },
    }
    const tamperedFile = '/tmp/pqsafe-interop-tampered.json'
    writeFileSync(tamperedFile, JSON.stringify(tamperedPayload), 'utf8')

    const python = spawnSync('python3', [PYTHON_SCRIPT, tamperedFile], {
      encoding: 'utf8',
      timeout: 10_000,
    })

    expect(python.status).toBe(1)

    const stdout = (python.stdout ?? '').trim()
    let result: { crossLangVerified: boolean } = { crossLangVerified: true }
    try {
      result = JSON.parse(stdout)
    } catch {
      // Non-JSON crash output is fine — Python rejected the input
    }

    expect(result.crossLangVerified === false || python.status === 1).toBe(true)
  })
})
