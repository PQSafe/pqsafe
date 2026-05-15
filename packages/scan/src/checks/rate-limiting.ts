import type { Check, Finding, ScanInput } from '../types.js';

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i, /rateLimit/i, /throttle/i, /debounce/i,
  /max_calls/i, /maxCalls/i, /call_limit/i, /request_limit/i,
  /p-limit/i, /bottleneck/i, /limiter/i,
];

const API_CALL_PATTERNS = [
  /tool_calls/i, /invoke\(/i, /run\(/i, /arun\(/i,
  /acall\(/i, /\.call\(/i,
];

export const rateLimitingCheck: Check = {
  id: 'rate-limiting',
  name: 'Missing Rate Limiting',
  run({ code }: ScanInput): Finding[] {
    const hasCalls = API_CALL_PATTERNS.filter(p => p.test(code)).length >= 2;
    if (!hasCalls) return [];

    const hasRateLimit = RATE_LIMIT_PATTERNS.some(p => p.test(code));
    if (hasRateLimit) return [];

    return [{
      id: 'rate-limiting',
      name: 'Missing Rate Limiting',
      severity: 'MEDIUM',
      status: 'WARN',
      message: 'No rate limiting detected on agent tool calls. A looping or injected agent can exhaust API quotas and run up costs.',
      fix: 'Add rate limiting to tool execution. Use p-limit or bottleneck to cap concurrent calls. Set max_iterations on the agent executor.',
      docs: 'https://pqsafe.xyz/scan/docs/rate-limiting',
    }];
  },
};
