/**
 * bench/scenarios/concurrent.bench.ts
 * Concurrent sign throughput benchmark using perf_hooks.
 * Target: ×10 avg <600µs, ×100 avg <800µs, ×1000 avg <2ms
 */

import { createEnvelope, signEnvelope } from '../../src/envelope.js'
import { FIXTURE_SECRET_KEY, FIXTURE_PUBLIC_KEY } from '../fixtures/keypair.js'
import { ENVELOPE_PARAMS } from '../fixtures/envelope.js'

export async function runConcurrentBench(): Promise<Array<{ name: string; avgMs: number }>> {
  const results: Array<{ name: string; avgMs: number }> = []
  for (const n of [1, 10, 100, 1000]) {
    const t0 = performance.now()
    await Promise.all(
      Array.from({ length: n }, () =>
        Promise.resolve().then(() => {
          const env = createEnvelope(ENVELOPE_PARAMS)
          return signEnvelope(env, FIXTURE_SECRET_KEY, FIXTURE_PUBLIC_KEY)
        })
      )
    )
    const elapsed = performance.now() - t0
    results.push({ name: `concurrent×${n}`, avgMs: elapsed / n })
  }
  return results
}
