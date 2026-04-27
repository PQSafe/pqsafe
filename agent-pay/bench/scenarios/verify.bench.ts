/**
 * bench/scenarios/verify.bench.ts
 * ML-DSA-65 verify latency benchmark.
 * Target: p50 <200µs, p99 <350µs (single core)
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { FIXTURE_SECRET_KEY, FIXTURE_PUBLIC_KEY, FIXTURE_MSG } from '../fixtures/keypair.js'
import { SIGNED_ENVELOPE } from '../fixtures/envelope.js'

const sig32 = ml_dsa65.sign(FIXTURE_MSG, FIXTURE_SECRET_KEY)
const envelopeBytes = new TextEncoder().encode(SIGNED_ENVELOPE.envelopeJson)
const sig1kb = new Uint8Array(Buffer.from(SIGNED_ENVELOPE.signature, 'hex'))
const pubKey = new Uint8Array(Buffer.from(SIGNED_ENVELOPE.dsaPublicKey, 'hex'))

export function runVerifyBench(iterations = 100): { name: string; avgMs: number; p99Ms: number } {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    ml_dsa65.verify(sig32, FIXTURE_MSG, FIXTURE_PUBLIC_KEY)
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  return {
    name: 'ML-DSA-65 verify (32B)',
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    p99Ms: times[Math.floor(times.length * 0.99)],
  }
}

export function runVerifyEnvelopeBench(iterations = 100): { name: string; avgMs: number; p99Ms: number } {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    ml_dsa65.verify(sig1kb, envelopeBytes, pubKey)
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  return {
    name: 'ML-DSA-65 verify (1KB envelope)',
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    p99Ms: times[Math.floor(times.length * 0.99)],
  }
}
