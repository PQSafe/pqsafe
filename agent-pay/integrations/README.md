# PQSafe AgentPay — Framework Integrations

Post-quantum safe payments for AI agents, across every major framework.

Matching the bar set by [Stripe Agent Toolkit](https://github.com/stripe/agent-toolkit) — native integrations for LangChain, CrewAI, MCP, and Mastra.

## Integrations

| Framework | Package | Install | Status |
|---|---|---|---|
| **LangChain** | `@pqsafe/agent-pay-langchain` | `npm install @pqsafe/agent-pay-langchain` | [![npm](https://img.shields.io/npm/v/@pqsafe/agent-pay-langchain.svg)](https://www.npmjs.com/package/@pqsafe/agent-pay-langchain) |
| **CrewAI** | `crewai-pqsafe` | `pip install crewai-pqsafe` | [![PyPI](https://img.shields.io/pypi/v/crewai-pqsafe.svg)](https://pypi.org/project/crewai-pqsafe/) |
| **MCP** | `@pqsafe/mcp-server` | `npx @pqsafe/mcp-server` | [![npm](https://img.shields.io/npm/v/@pqsafe/mcp-server.svg)](https://www.npmjs.com/package/@pqsafe/mcp-server) |
| **Mastra** | `@pqsafe/mastra` | `npm install @pqsafe/mastra` | [![npm](https://img.shields.io/npm/v/@pqsafe/mastra.svg)](https://www.npmjs.com/package/@pqsafe/mastra) *(experimental)* |

---

## LangChain

```bash
npm install @pqsafe/agent-pay-langchain @langchain/core
```

```typescript
import { PQSafePaymentTool } from '@pqsafe/agent-pay-langchain'

const tool = new PQSafePaymentTool({ envelope: signedEnvelope, mockMode: true })
const agent = createReactAgent({ llm, tools: [tool] })
```

[Full docs](./langchain/README.md)

---

## CrewAI

```bash
pip install crewai-pqsafe
```

```python
from crewai_pqsafe import PQSafePaymentTool

finance_agent = Agent(
    role="Finance Agent",
    tools=[PQSafePaymentTool(mock_mode=True)],
)
```

[Full docs](./crewai/README.md)

---

## MCP (Claude Desktop, Cursor, Windsurf)

```bash
npx @pqsafe/mcp-server
```

Claude Desktop `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "pqsafe": { "command": "npx", "args": ["@pqsafe/mcp-server"] }
  }
}
```

Tools exposed: `pqsafe.create_envelope`, `pqsafe.verify_envelope`, `pqsafe.execute_payment`, `pqsafe.get_envelope_status`

[Full docs](./mcp/README.md)

---

## Mastra *(experimental)*

```bash
npm install @pqsafe/mastra @mastra/core
```

```typescript
import { createTool } from '@mastra/core'
import { pqsafeToolConfig } from '@pqsafe/mastra'

const pqsafeTool = createTool(pqsafeToolConfig)
```

[Full docs](./mastra/README.md)

---

## Architecture

```
wallet (PQSafe extension)
  └── createEnvelope() + signEnvelope()    ← ML-DSA-65 post-quantum signing
        │
        ▼
  SignedEnvelope (authorization token)
        │
        ├── LangChain PQSafePaymentTool    ← @pqsafe/agent-pay-langchain
        ├── CrewAI PQSafePaymentTool       ← crewai-pqsafe
        ├── MCP server                     ← @pqsafe/mcp-server (stdio)
        └── Mastra pqsafeToolConfig        ← @pqsafe/mastra
              │
              ▼
        @pqsafe/agent-pay (core SDK)
          ├── verifyEnvelope()             ← ML-DSA-65 verify
          ├── allowlist check
          ├── amount ceiling check
          └── routePayment()              ← airwallex / stripe / wise / usdc-base / x402
```

## Mock mode

Every integration supports mock mode — runnable with zero credentials:

| Framework | How to enable |
|---|---|
| LangChain | `new PQSafePaymentTool({ envelope, mockMode: true })` |
| CrewAI | `PQSafePaymentTool(mock_mode=True)` |
| MCP | `pqsafe.execute_payment` with `mock_mode: true` |
| Mastra | `createPQSafeIntegration({ mockMode: true })` |

## Core SDK

All integrations are thin wrappers around [`@pqsafe/agent-pay`](../README.md).
The SDK is the single source of truth for envelope verification, guard-rails,
and rail routing.
