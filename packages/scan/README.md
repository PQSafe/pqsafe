# @pqsafe/scan

**Static security scanner for AI agents.** Finds critical vulnerabilities in LangChain, AutoGen, CrewAI, and custom agents before they reach production.

```bash
npx @pqsafe/scan ./my-agent.ts
```

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  pqsafe-scan  AI Agent Security Report
  payment-agent.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Grade  [ F ]   Score: 10/100
  3 CRITICAL issues found — agent is not safe to deploy.

  [CRITICAL] Exposed API Keys & Secrets
  OpenAI API key hardcoded in source at line 4
  → const openai = new OpenAI({ apiKey: "sk-proj-..." })
  Fix: Move to environment variables.

  [CRITICAL] Missing Spending Limits
  Agent can make payments but no spending limit is defined.
  Fix: Add a max_spend or budget_cap to every agent with payment tools.

  [CRITICAL] Unauthenticated Agent Endpoint
  HTTP endpoint detected with no authentication.
  Fix: Add API key validation or JWT verification.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Share: https://pqsafe.xyz/scan
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Install

```bash
npm install -g @pqsafe/scan
# or run without installing
npx @pqsafe/scan ./agent.ts
```

## Usage

```bash
# Scan a file
pqsafe-scan ./agents/payment-agent.ts

# Scan a directory
pqsafe-scan ./src/agents/

# Pipe from stdin
cat agent.py | pqsafe-scan --stdin

# JSON output (for CI)
pqsafe-scan ./agent.ts --json

# CI — exits with code 2 if CRITICAL found
pqsafe-scan ./agent.ts && echo "Safe to deploy"
```

## What it checks

| Check | Severity | What it finds |
|---|---|---|
| Exposed API Keys | 🔴 CRITICAL | Hardcoded `sk-`, `OPENAI_API_KEY`, tokens in source |
| Unauthenticated Endpoint | 🔴 CRITICAL | HTTP routes with no auth middleware |
| Missing Spending Limits | 🔴 CRITICAL | Payment agents with no budget cap |
| Prompt Injection | 🟠 HIGH | User input interpolated into system prompts |
| Data Exfiltration Risk | 🟠 HIGH | Tool functions leaking context/memory externally |
| Missing Kill Switch | 🟠 HIGH | Agents with no timeout or max_iterations |
| Missing Audit Logging | 🟠 HIGH | No logging of agent actions |
| Quantum-Vulnerable Crypto | 🟡 MEDIUM | RSA/ECDSA/Ed25519 — breakable by quantum computers (NSA CNSA 2.0 mandates migration by 2027) |
| Missing Rate Limiting | 🟡 MEDIUM | No throttle on tool calls |

## Programmatic API

```typescript
import { scan } from '@pqsafe/scan';

const report = scan({ code: agentCode, filename: 'agent.ts' });

console.log(report.grade);    // 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
console.log(report.score);    // 0–100
console.log(report.findings); // detailed findings with line numbers
```

## CI Integration

```yaml
# .github/workflows/security.yml
- name: Scan AI agents
  run: npx @pqsafe/scan ./src/agents/ --json
```

Exit codes: `0` = clean, `2` = CRITICAL findings (blocks deploy)

## Frameworks supported

LangChain · AutoGen · CrewAI · LlamaIndex · custom agents

## About PQSafe

PQSafe is building the post-quantum authorization layer for AI agents — cryptographic spend envelopes, ML-DSA-65 signing, and the AP2-PQ standard at FIDO Alliance.

→ [pqsafe.xyz](https://pqsafe.xyz)
