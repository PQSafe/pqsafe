import type { Check, Finding, ScanInput } from '../types.js';

// Tool functions that make outbound HTTP calls — potential data exfiltration
const EXFIL_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /(?:fetch|axios\.(?:get|post)|http\.request|https\.request)\s*\([^)]*(?:memory|context|retrieved|documents|vector|embedding)/gi,
    message: 'HTTP call includes memory/context data — potential exfiltration of retrieved documents',
  },
  {
    pattern: /tool.*?=>.*?(?:fetch|axios)\s*\(\s*`[^`]*\$\{/gi,
    message: 'Tool function makes dynamic HTTP call with template literal — verify no context leakage',
  },
  {
    pattern: /sendEmail.*?(?:body|content|text)\s*[:=]\s*(?:memory|context|docs|retrieved)/gi,
    message: 'Email tool may be sending retrieved context/memory to external address',
  },
];

export const dataExfiltrationCheck: Check = {
  id: 'data-exfiltration',
  name: 'Data Exfiltration Risk',
  run({ code }: ScanInput): Finding[] {
    const findings: Finding[] = [];
    const lines = code.split('\n');

    for (const { pattern, message } of EXFIL_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(code);
      if (match) {
        const lineNum = code.slice(0, match.index).split('\n').length;
        const snippet = lines[lineNum - 1]?.trim().slice(0, 80);
        findings.push({
          id: 'data-exfiltration',
          name: 'Data Exfiltration Risk',
          severity: 'HIGH',
          status: 'WARN',
          message: `${message} at line ${lineNum}`,
          line: lineNum,
          snippet,
          fix: 'Audit tool functions for unintended data sends. Restrict tool output to the minimum needed. Log all outbound calls from agent tools.',
          docs: 'https://pqsafe.xyz/scan/docs/data-exfiltration',
        });
      }
    }

    return findings;
  },
};
