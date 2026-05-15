import type { Check, Finding, ScanInput } from '../types.js';

const KILL_PATTERNS = [
  /max_iterations/i, /maxIterations/i, /max_steps/i, /maxSteps/i,
  /timeout/i, /time_limit/i, /timeLimit/i, /max_turns/i, /maxTurns/i,
  /abort/i, /stop_condition/i, /stopCondition/i, /max_retries/i,
];

const AGENT_PATTERNS = [
  /AgentExecutor/i, /initialize_agent/i, /create_react_agent/i,
  /AutoGen/i, /AssistantAgent/i, /ConversableAgent/i,
  /CrewAI/i, /Agent\(/i, /new Agent/i,
];

export const killSwitchCheck: Check = {
  id: 'kill-switch',
  name: 'Missing Kill Switch / Timeout',
  run({ code }: ScanInput): Finding[] {
    const hasAgent = AGENT_PATTERNS.some(p => p.test(code));
    if (!hasAgent) return [];

    const hasKillSwitch = KILL_PATTERNS.some(p => p.test(code));
    if (hasKillSwitch) return [];

    return [{
      id: 'kill-switch',
      name: 'Missing Kill Switch / Timeout',
      severity: 'HIGH',
      status: 'FAIL',
      message: 'No max_iterations, timeout, or stop condition found. Agent can run indefinitely, burning API credits and causing runaway tool calls.',
      fix: 'Set max_iterations (LangChain), max_turns (AutoGen), or a timeout. Always define when an agent should stop.',
      docs: 'https://pqsafe.xyz/scan/docs/kill-switch',
    }];
  },
};
