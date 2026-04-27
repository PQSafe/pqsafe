/**
 * bench/scenarios/sign.bench.ts
 * ML-DSA-65 sign latency benchmark.
 * Target: p50 <500µs, p99 <800µs (single core)
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js'
import { FIXTURE_SECRET_KEY, FIXTURE_MSG } from '../fixtures/keypair.js'
import { ENVELOPE_1KB } from '../fixtures/envelope.js'

const envelopeBytes = new TextEncoder().encode(JSON.stringify(ENVELOPE_1KB))

export function runSignBench(iterations = 100): { name: string; avgMs: number; p99Ms: number } {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    ml_dsa65.sign(FIXTURE_MSG, FIXTURE_SECRET_KEY)
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  return {
    name: 'ML-DSA-65 sign (32B)',
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    p99Ms: times[Math.floor(times.length * 0.99)],
  }
}

export function runSignEnvelopeBench(iterations = 100): { name: string; avgMs: number; p99Ms: number } {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    ml_dsa65.sign(envelopeBytes, FIXTURE_SECRET_KEY)
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  return {
    name: 'ML-DSA-65 sign (1KB envelope)',
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    p99Ms: times[Math.floor(times.length * 0.99)],
  }
}
