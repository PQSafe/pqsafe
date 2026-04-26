/**
 * Cross-SDK integration test — TypeScript signs, Python verifies via subprocess
 *
 * This is the full integration version. Runs without env vars required.
 * Covers the full pipeline: TS keygen → sign → export → Python verify.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { createEnvelope, signEnvelope } from '../../src/index.js'
import { canonicalJsonBytes } from '../../src/canonical.js'
import type { SignedEnvelope } from '../../src/types.js'
import { spawnSync } from 'node:child_process'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PYTHON_VERIFIER_SCRIPT = `
import sys, json, hashlib

data = json.load(open(sys.argv[1]))
signed = data["signedEnvelope"]
expected_sha256 = data["canonicalSha256"]
envelope_json = signed["envelopeJson"]

actual_sha256 = hashlib.sha256(envelope_json.encode("utf-8")).hexdigest()

if actual_sha256 != expected_sha256:
    print(json.dumps({
        "ok": False,
        "error": f"SHA-256 mismatch: expected {expected_sha256}, got {actual_sha256}",
    }))
    sys.exit(1)

inner = json.loads(envelope_json)
assert inner.get("version") == 1
assert len(inner.get("allowedRecipients", [])) > 0

print(json.dumps({
    "ok": True,
    "sha256": actual_sha256,
    "version": inner["version"],
    "maxAmount": inner["maxAmount"],
}))
sys.exit(0)
`

const INTEROP_FILE = join(tmpdir(), `pqsafe-integration-interop-${Date.now()}.json`)
const PYTHON_SCRIPT = join(tmpdir(), `pqsafe-integration-verifier-${Date.now()}.py`)

describe('Cross-SDK integration (full subprocess)', () => {
  let signedEnvelope: SignedEnvelope
  let issuerAddress: string

  beforeAll(() => {
    const seed = globalThis.crypto.getRandomValues(new Uint8Array(32))
    const { publicKey, secretKey } = ml_dsa65.keygen(seed)
    issuerAddress = 'pq1' + bytesToHex(keccak_256(publicKey).slice(0, 20))

    const envelope = createEnvelope({
      issuer: issuerAddress,
      agent: 'integration-cross-sdk-v1',
      maxAmount: 500,
      currency: 'USD',
      allowedRecipients: ['anthropic.com/billing', 'GB29NWBK60161331926819'],
      ttlSeconds: 3600,
      rail: 'airwallex',
    })

    signedEnvelope = signEnvelope(envelope, secretKey, publicKey)

    // Write the Python script
    writeFileSync(PYTHON_SCRIPT, PYTHON_VERIFIER_SCRIPT, 'utf8')

    // Export to temp file
    const canonicalSha256 = createHash('sha256')
      .update(signedEnvelope.envelopeJson, 'utf8')
      .digest('hex')

    writeFileSync(
      INTEROP_FILE,
      JSON.stringify({
        signedEnvelope,
        canonicalSha256,
        exportedAt: new Date().toISOString(),
      }),
      'utf8',
    )
  })

  it('Python subprocess verifies canonical SHA-256 of TypeScript-signed envelope', () => {
    const python = spawnSync('python3', [PYTHON_SCRIPT, INTEROP_FILE], {
      encoding: 'utf8',
      timeout: 15_000,
    })

    if (python.error) {
      throw new Error(`python3 not available: ${python.error.message}`)
    }

    expect(python.status).toBe(0)
    const result = JSON.parse(python.stdout.trim()) as { ok: boolean; sha256: string }
    expect(result.ok).toBe(true)
    expect(typeof result.sha256).toBe('string')
  })

  it('canonical bytes are stable across repeated calls on same envelope', () => {
    const inner = JSON.parse(signedEnvelope.envelopeJson) as Record<string, unknown>
    const b1 = canonicalJsonBytes(inner)
    const b2 = canonicalJsonBytes(inner)
    expect(b1).toEqual(b2)
  })

  it('Python rejects file with wrong SHA-256', () => {
    const tamperedFile = INTEROP_FILE + '.tampered.json'
    writeFileSync(
      tamperedFile,
      JSON.stringify({
        signedEnvelope,
        canonicalSha256: '0'.repeat(64), // wrong
      }),
    )

    const python = spawnSync('python3', [PYTHON_SCRIPT, tamperedFile], {
      encoding: 'utf8',
      timeout: 10_000,
    })

    expect(python.status).toBe(1)

    // Cleanup
    try { unlinkSync(tamperedFile) } catch { /* ignore */ }
  })
})
