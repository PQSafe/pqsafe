import type { Check, Finding, ScanInput } from '../types.js';

const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, label: 'OpenAI API key' },
  { pattern: /sk-ant-[a-zA-Z0-9\-]{20,}/g, label: 'Anthropic API key' },
  { pattern: /AIza[0-9A-Za-z\-_]{35}/g, label: 'Google API key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, label: 'GitHub personal access token' },
  { pattern: /xoxb-[0-9]{11}-[0-9]{11}-[a-zA-Z0-9]{24}/g, label: 'Slack bot token' },
  { pattern: /(?:password|passwd|secret|api_key|apikey|token)\s*[:=]\s*["'][^"']{8,}["']/gi, label: 'Hardcoded credential' },
  { pattern: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g, label: 'Hardcoded Bearer token' },
];

export const exposedSecretsCheck: Check = {
  id: 'exposed-secrets',
  name: 'Exposed API Keys & Secrets',
  run({ code, filename }: ScanInput): Finding[] {
    const findings: Finding[] = [];
    const lines = code.split('\n');

    for (const { pattern, label } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(code)) !== null) {
        const lineNum = code.slice(0, match.index).split('\n').length;
        const snippet = lines[lineNum - 1]?.trim().slice(0, 80);
        findings.push({
          id: 'exposed-secrets',
          name: 'Exposed API Keys & Secrets',
          severity: 'CRITICAL',
          status: 'FAIL',
          message: `${label} hardcoded in source at line ${lineNum}`,
          line: lineNum,
          snippet,
          fix: 'Move to environment variables. Use process.env.YOUR_KEY or a secrets manager. Never commit credentials.',
          docs: 'https://pqsafe.xyz/scan/docs/exposed-secrets',
        });
      }
    }

    return findings;
  },
};
