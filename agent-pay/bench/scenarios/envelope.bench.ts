/**
 * bench/scenarios/envelope.bench.ts
 * End-to-end signEnvelope() latency benchmark.
 * Target: p50 <1ms, p99 <1.5ms
 */

import { createEnvelope, signEnvelope } from '../../src/envelope.js'
import { FIXTURE_SECRET_KEY, FIXTURE_PUBLIC_KEY } from '../fixtures/keypair.js'
import { ENVELOPE_PARAMS } from '../fixtures/envelope.js'

export function runEnvelopeBench(iterations = 100): { name: string; avgMs: number; p99Ms: number } {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    const env = createEnvelope(ENVELOPE_PARAMS)
    signEnvelope(env, FIXTURE_SECRET_KEY, FIXTURE_PUBLIC_KEY)
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  return {
    name: 'End-to-end createEnvelope + sign',
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    p99Ms: times[Math.floor(times.length * 0.99)],
  }
}
