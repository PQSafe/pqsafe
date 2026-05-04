/**
 * reporter.ts — TAP-style and JSON output formatters for conformance results.
 *
 * TAP (Test Anything Protocol) version 14 output allows any TAP consumer
 * (tap-spec, Jest's tap reporter, GitHub Actions, etc.) to parse results.
 */

import type { ConformanceReport, TestResult } from './types.js'

// ---------------------------------------------------------------------------
// TAP output
// ---------------------------------------------------------------------------

/**
 * Format a single test result line in TAP 14 format.
 *
 * ok 1 - tc1-minimal — positive: Minimal 5-field mandate verifies
 * not ok 6 - tc1-neg-tampered-payload — negative: tampered payload rejected
 */
function tapLine(index: number, result: TestResult): string {
  const status = result.passed ? 'ok' : 'not ok'
  const sign = result.expectValid ? 'positive' : 'negative'
  const line = `${status} ${index} - ${result.id} — ${sign}: ${result.description}`

  if (!result.passed && result.failureReason) {
    // TAP YAML diagnostic block
    const yaml = [
      '  ---',
      `  severity: fail`,
      `  message: "${result.failureReason.replace(/"/g, "'")}"`,
      `  durationMs: ${result.durationMs}`,
      '  ...',
    ].join('\n')
    return `${line}\n${yaml}`
  }

  return line
}

/**
 * Render a full TAP 14 output string from a ConformanceReport.
 */
export function formatTap(report: ConformanceReport): string {
  const lines: string[] = []

  lines.push('TAP version 14')
  lines.push(`1..${report.total}`)
  lines.push(
    `# AP2-PQ Conformance — vectors from ${report.fixturesUrl}`
  )
  lines.push(`# pubkey fingerprint: ${report.pubkeyFingerprint}`)
  lines.push(`# run at: ${report.timestamp}`)
  if (report.skipped > 0) {
    lines.push(`# (${report.skipped} vector(s) skipped — no ML-DSA sig present)`)
  }
  lines.push('')

  report.results.forEach((result, i) => {
    lines.push(tapLine(i + 1, result))
  })

  lines.push('')
  if (report.failed === 0) {
    lines.push(`# All ${report.total} tests passed`)
  } else {
    lines.push(
      `# ${report.passed}/${report.total} tests passed — ${report.failed} FAILED`
    )

    // Summarise failures
    const failures = report.results.filter((r) => !r.passed)
    failures.forEach((f) => {
      lines.push(`# FAIL: ${f.id} — ${f.failureReason ?? 'unknown reason'}`)
    })
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

/**
 * Render a machine-readable JSON string from a ConformanceReport.
 */
export function formatJson(report: ConformanceReport): string {
  return JSON.stringify(report, null, 2)
}

// ---------------------------------------------------------------------------
// Console summary (used at end of TAP block)
// ---------------------------------------------------------------------------

/**
 * Print a single-line summary to stderr.  Useful when TAP output is piped.
 */
export function printSummary(report: ConformanceReport): void {
  const icon = report.failed === 0 ? '✓' : '✗'
  const msg =
    report.failed === 0
      ? `${icon} All ${report.total} AP2-PQ conformance tests passed`
      : `${icon} ${report.failed}/${report.total} AP2-PQ conformance tests FAILED`
  process.stderr.write(msg + '\n')
}
