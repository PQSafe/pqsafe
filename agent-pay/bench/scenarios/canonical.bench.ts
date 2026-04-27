/**
 * bench/scenarios/canonical.bench.ts
 * RFC 8785 canonical JSON serialization throughput benchmark.
 * Target: p50 <50µs, p99 <80µs (1KB envelope)
 */

import canonicalize from 'canonicalize'
import { ENVELOPE_1KB } from '../fixtures/envelope.js'

export function runCanonicalBench(iterations = 500): { name: string; avgMs: number; p99Ms: number } {
  const times: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    canonicalize(ENVELOPE_1KB)
    times.push(performance.now() - t0)
  }
  times.sort((a, b) => a - b)
  return {
    name: 'Canonical JSON (1KB envelope)',
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    p99Ms: times[Math.floor(times.length * 0.99)],
  }
}
