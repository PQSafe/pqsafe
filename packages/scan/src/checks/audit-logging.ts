import type { Check, Finding, ScanInput } from '../types.js';

const LOGGING_PATTERNS = [
  /console\.log/i, /logger\./i, /winston/i, /pino/i, /bunyan/i,
  /audit/i, /logging/i, /telemetry/i, /trace/i, /langfuse/i,
  /langsmith/i, /callbacks/i, /on_agent_action/i, /on_tool_start/i,
];

const AGENT_PATTERNS = [
  /AgentExecutor/i, /initialize_agent/i, /AutoGen/i,
  /AssistantAgent/i, /CrewAI/i, /Agent\(/i,
];

export const auditLoggingCheck: Check = {
  id: 'audit-logging',
  name: 'Missing Audit Logging',
  run({ code }: ScanInput): Finding[] {
    const hasAgent = AGENT_PATTERNS.some(p => p.test(code));
    if (!hasAgent) return [];

    const hasLogging = LOGGING_PATTERNS.some(p => p.test(code));
    if (hasLogging) return [];

    return [{
      id: 'audit-logging',
      name: 'Missing Audit Logging',
      severity: 'HIGH',
      status: 'FAIL',
      message: 'No audit logging detected. When your agent takes an unexpected action, you will have no record of what happened or why.',
      fix: 'Add callbacks (LangChain) or logging middleware. Consider Langfuse or LangSmith for production agent observability.',
      docs: 'https://pqsafe.xyz/scan/docs/audit-logging',
    }];
  },
};
