import type { ScanReport, Grade } from './types.js';

const GRADE_COLOR: Record<Grade, string> = {
  'A+': '\x1b[32m', // green
  'A':  '\x1b[32m',
  'B':  '\x1b[33m', // yellow
  'C':  '\x1b[33m',
  'D':  '\x1b[31m', // red
  'F':  '\x1b[31m',
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: '\x1b[41m\x1b[37m', // red bg
  HIGH:     '\x1b[31m',          // red
  MEDIUM:   '\x1b[33m',          // yellow
  LOW:      '\x1b[36m',          // cyan
  INFO:     '\x1b[90m',          // gray
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export function printReport(report: ScanReport): void {
  const gradeColor = GRADE_COLOR[report.grade];
  console.log('');
  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}  pqsafe-scan  AI Agent Security Report${RESET}`);
  if (report.filename) console.log(`  ${report.filename}`);
  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log('');
  console.log(`  Grade   ${gradeColor}${BOLD} ${report.grade} ${RESET}   Score: ${report.score}/100`);
  console.log(`  ${report.summary}`);
  console.log('');

  if (report.findings.length === 0) {
    console.log(`  ${BOLD}✓ All checks passed${RESET}`);
  } else {
    for (const f of report.findings) {
      const color = SEVERITY_COLOR[f.severity] ?? '';
      console.log(`  ${color}${BOLD}[${f.severity}]${RESET} ${f.name}`);
      console.log(`  ${f.message}`);
      if (f.snippet) console.log(`  ${BOLD}→${RESET} ${f.snippet}`);
      console.log(`  ${BOLD}Fix:${RESET} ${f.fix}`);
      console.log('');
    }
  }

  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`  Share: https://pqsafe.xyz/scan  |  npm install @pqsafe/scan`);
  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log('');
}

export function jsonReport(report: ScanReport): string {
  return JSON.stringify(report, null, 2);
}
