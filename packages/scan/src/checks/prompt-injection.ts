import type { Check, Finding, ScanInput } from '../types.js';

// System prompts that directly interpolate user input without sanitization
const INJECTION_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /system.*?[`'"]\s*\$\{[^}]*(?:user|input|query|message|request)[^}]*\}/gi,
    message: 'User-controlled variable interpolated directly into system prompt',
  },
  {
    pattern: /system.*?[`'"]\s*\+\s*(?:user|input|query|message|request)/gi,
    message: 'User input concatenated into system prompt',
  },
  {
    pattern: /f["'].*\{(?:user|input|query|message|request)[^}]*\}.*["']/gi,
    message: 'User input f-string injected into prompt (Python)',
  },
  {
    pattern: /format\(.*(?:user|input|query|message|request)/gi,
    message: 'User input via .format() into prompt without sanitization',
  },
  {
    pattern: /ignore.*previous.*instructions/gi,
    message: 'Known prompt injection phrase in codebase',
  },
];

export const promptInjectionCheck: Check = {
  id: 'prompt-injection',
  name: 'Prompt Injection Vulnerability',
  run({ code }: ScanInput): Finding[] {
    const findings: Finding[] = [];
    const lines = code.split('\n');

    for (const { pattern, message } of INJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(code);
      if (match) {
        const lineNum = code.slice(0, match.index).split('\n').length;
        const snippet = lines[lineNum - 1]?.trim().slice(0, 80);
        findings.push({
          id: 'prompt-injection',
          name: 'Prompt Injection Vulnerability',
          severity: 'HIGH',
          status: 'FAIL',
          message: `${message} at line ${lineNum}. Attacker-controlled input can hijack agent instructions.`,
          line: lineNum,
          snippet,
          fix: 'Never interpolate user input into system prompts. Use a separate user message. Validate and sanitize all external inputs before passing to the agent.',
          docs: 'https://pqsafe.xyz/scan/docs/prompt-injection',
        });
      }
    }

    return findings;
  },
};
