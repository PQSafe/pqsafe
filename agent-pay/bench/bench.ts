/**
 * bench/bench.ts — PQSafe AgentPay benchmark runner
 *
 * Run:  npm run bench
 * CI:   npm run bench:ci   (JSON output to bench/results/latest.json)
 *
 * Uses simple perf_hooks timing (no external benchmark framework required).
 * Add mitata in devDependencies when you want structured iteration control.
 */

import { runSignBench, runSignEnvelopeBench } from './scenarios/sign.bench.js'
import { runVerifyBench, runVerifyEnvelopeBench } from './scenarios/verify.bench.js'
import { runCanonicalBench } from './scenarios/canonical.bench.js'
import { runEnvelopeBench } from './scenarios/envelope.bench.js'
import { runConcurrentBench } from './scenarios/concurrent.bench.js'
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Targets in ms (from pqsafe_perf_benchmark_spec_2026-04-26.md)
const TARGETS: Record<string, { p50: number; p99: number }> = {
  'ML-DSA-65 sign (32B)':               { p50: 0.500, p99: 0.800 },
  'ML-DSA-65 sign (1KB envelope)':      { p50: 0.500, p99: 0.800 },
  'ML-DSA-65 verify (32B)':             { p50: 0.200, p99: 0.350 },
  'ML-DSA-65 verify (1KB envelope)':    { p50: 0.200, p99: 0.350 },
  'Canonical JSON (1KB envelope)':      { p50: 0.050, p99: 0.080 },
  'End-to-end createEnvelope + sign':   { p50: 1.000, p99: 1.500 },
  'concurrent×1':                        { p50: 1.000, p99: 1.500 },
  'concurrent×10':                       { p50: 0.600, p99: Infinity },
  'concurrent×100':                      { p50: 0.800, p99: Infinity },
  'concurrent×1000':                     { p50: 2.000, p99: Infinity },
}

interface BenchResult {
  name: string
  avgMs: number
  p99Ms?: number
  targetP50Ms?: number
  targetP99Ms?: number
  pass: boolean
}

console.log('\n=== PQSafe AgentPay Benchmark ===\n')

const results: BenchResult[] = []

function record(r: { name: string; avgMs: number; p99Ms?: number }): void {
  const t = TARGETS[r.name]
  const pass = t
    ? r.avgMs <= t.p50 && (r.p99Ms === undefined || r.p99Ms <= t.p99)
    : true
  results.push({
    ...r,
    targetP50Ms: t?.p50,
    targetP99Ms: t?.p99,
    pass,
  })
  const status = pass ? '✓' : '✗'
  const avg = r.avgMs.toFixed(3).padStart(8)
  const p99 = r.p99Ms !== undefined ? `  p99=${r.p99Ms.toFixed(3)}ms` : ''
  console.log(`  ${status}  ${r.name.padEnd(42)} avg=${avg}ms${p99}`)
}

// Serial benchmarks
record(runSignBench(200))
record(runSignEnvelopeBench(200))
record(runVerifyBench(200))
record(runVerifyEnvelopeBench(200))
record(runCanonicalBench(1000))
record(runEnvelopeBench(200))

// Concurrent benchmarks
const concResults = await runConcurrentBench()
for (const r of concResults) record(r)

console.log()

const failures = results.filter(r => !r.pass)
if (failures.length > 0) {
  console.log(`FAILURES (${failures.length}):`)
  for (const f of failures) console.log(`  - ${f.name}: avg=${f.avgMs.toFixed(3)}ms (target p50=${f.targetP50Ms}ms)`)
} else {
  console.log('All benchmarks within targets.')
}

// JSON output for CI
if (process.argv.includes('--json') || process.env.CI) {
  let gitSha = 'unknown'
  try { gitSha = execSync('git rev-parse --short HEAD').toString().trim() } catch {}
  const out = {
    timestamp: new Date().toISOString(),
    git_sha: gitSha,
    node_version: process.version,
    results,
  }
  mkdirSync(join(__dirname, 'results', 'history'), { recursive: true })
  const outPath = join(__dirname, 'results', 'latest.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log(`\nResults written to ${outPath}`)
}

process.exit(failures.length > 0 ? 1 : 0)
