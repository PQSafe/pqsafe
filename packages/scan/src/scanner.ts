import type { ScanInput, ScanReport, Grade, Finding } from './types.js';
import {
  exposedSecretsCheck,
  spendingLimitsCheck,
  killSwitchCheck,
  auditLoggingCheck,
  pqCryptoCheck,
  promptInjectionCheck,
  dataExfiltrationCheck,
  rateLimitingCheck,
  authMissingCheck,
} from './checks/index.js';

const ALL_CHECKS = [
  exposedSecretsCheck,
  authMissingCheck,
  spendingLimitsCheck,
  promptInjectionCheck,
  dataExfiltrationCheck,
  killSwitchCheck,
  auditLoggingCheck,
  pqCryptoCheck,
  rateLimitingCheck,
];

const SEVERITY_SCORE: Record<string, number> = {
  CRITICAL: 30,
  HIGH: 15,
  MEDIUM: 7,
  LOW: 2,
  INFO: 0,
};

function computeGrade(score: number): Grade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

function buildSummary(findings: Finding[], grade: Grade): string {
  const criticals = findings.filter(f => f.severity === 'CRITICAL').length;
  const highs = findings.filter(f => f.severity === 'HIGH').length;

  if (findings.length === 0) return 'No issues found. Your agent looks secure.';
  if (criticals > 0) return `${criticals} CRITICAL issue${criticals > 1 ? 's' : ''} found — agent is not safe to deploy.`;
  if (highs > 0) return `${highs} HIGH severity issue${highs > 1 ? 's' : ''} — fix before production.`;
  return `Grade ${grade} — ${findings.length} issue${findings.length > 1 ? 's' : ''} to review.`;
}

export function scan(input: ScanInput): ScanReport {
  const allFindings: Finding[] = [];

  for (const check of ALL_CHECKS) {
    allFindings.push(...check.run(input));
  }

  let deductions = 0;
  for (const f of allFindings) {
    deductions += SEVERITY_SCORE[f.severity] ?? 0;
  }

  const score = Math.max(0, 100 - deductions);
  const grade = computeGrade(score);
  const failed = allFindings.filter(f => f.status === 'FAIL').length;
  const passed = ALL_CHECKS.length - new Set(allFindings.map(f => f.id)).size;

  return {
    grade,
    score,
    passed,
    failed,
    findings: allFindings,
    summary: buildSummary(allFindings, grade),
    scannedAt: new Date().toISOString(),
    filename: input.filename,
    framework: input.framework,
  };
}
