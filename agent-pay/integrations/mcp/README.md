# @pqsafe/mcp-server

PQSafe AgentPay MCP server — exposes post-quantum payment tools to Claude Desktop, Cursor, Windsurf, and any MCP-compatible host.

[![npm version](https://img.shields.io/npm/v/@pqsafe/mcp-server.svg)](https://www.npmjs.com/package/@pqsafe/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Tools

| Tool | Description |
|---|---|
| `pqsafe.create_envelope` | Issuer builds + ML-DSA-65 signs a SpendEnvelope |
| `pqsafe.verify_envelope` | Standalone signature + schema verification |
| `pqsafe.execute_payment` | Verify envelope + route payment to rail |
| `pqsafe.get_envelope_status` | Inspect expiry, budget, revocation stub |

## Install

```bash
npm install -g @pqsafe/mcp-server
# or run directly:
npx @pqsafe/mcp-server
```

## Claude Desktop configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pqsafe": {
      "command": "npx",
      "args": ["@pqsafe/mcp-server"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "pqsafe": {
      "command": "pqsafe-mcp"
    }
  }
}
```

## Cursor configuration

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "pqsafe": {
      "command": "npx",
      "args": ["@pqsafe/mcp-server"]
    }
  }
}
```

## Usage with Claude

Once connected, Claude can:

1. **Create an envelope** (mock mode — no key needed):
   > "Create a PQSafe SpendEnvelope for agent 'my-bot' with max $100 USD to recipient 'anthropic.com/billing', valid 1 hour"

2. **Execute a payment** (mock mode):
   > "Execute a mock payment of $49.99 to anthropic.com/billing using the envelope above"

3. **Check envelope status**:
   > "What is the status of my SpendEnvelope? Is it expired?"

## Mock mode

All tools support mock mode — no credentials or payment rails needed:

- `pqsafe.create_envelope`: omit `secret_key_hex` → generates throw-away test keypair
- `pqsafe.execute_payment`: set `mock_mode: true` → returns synthetic `txId`

## Dev / inspect

```bash
# Run locally with MCP Inspector
cd integrations/mcp
npm install
npm run inspect
```

## Smithery / MCP registry

See `smithery.yaml` for registry submission metadata (post-YC publish).

## Related

- [`@pqsafe/agent-pay`](../../README.md) — core SDK
- [`@pqsafe/agent-pay-langchain`](../langchain/) — LangChain integration
- [`crewai-pqsafe`](../crewai/) — CrewAI integration
- [`@pqsafe/mastra`](../mastra/) — Mastra integration
