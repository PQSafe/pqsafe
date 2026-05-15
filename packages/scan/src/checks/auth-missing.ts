import type { Check, Finding, ScanInput } from '../types.js';

const AUTH_PATTERNS = [
  /authenticate/i, /authorization/i, /auth_token/i, /api_key/i,
  /bearer/i, /jwt\./i, /verify_token/i, /checkAuth/i,
  /middleware.*auth/i, /auth.*middleware/i, /isAuthenticated/i,
  /requiresAuth/i, /protected/i,
];

// Indicators the code exposes an HTTP endpoint
const ENDPOINT_PATTERNS = [
  /app\.(get|post|put|delete|patch)\s*\(/i,
  /router\.(get|post|put|delete|patch)\s*\(/i,
  /fastify\.(get|post)\s*\(/i,
  /http\.createServer/i,
  /serve\s*\(/i, /Hono\(\)/i,
];

export const authMissingCheck: Check = {
  id: 'auth-missing',
  name: 'Unauthenticated Agent Endpoint',
  run({ code }: ScanInput): Finding[] {
    const hasEndpoint = ENDPOINT_PATTERNS.some(p => p.test(code));
    if (!hasEndpoint) return [];

    const hasAuth = AUTH_PATTERNS.some(p => p.test(code));
    if (hasAuth) return [];

    return [{
      id: 'auth-missing',
      name: 'Unauthenticated Agent Endpoint',
      severity: 'CRITICAL',
      status: 'FAIL',
      message: 'HTTP endpoint detected with no authentication. Anyone who discovers this endpoint can invoke your agent.',
      fix: 'Add API key validation or JWT verification before any agent invocation. Never expose agent endpoints without auth.',
      docs: 'https://pqsafe.xyz/scan/docs/auth-missing',
    }];
  },
};
