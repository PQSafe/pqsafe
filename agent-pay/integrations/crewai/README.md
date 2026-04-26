# crewai-pqsafe

CrewAI integration for [PQSafe AgentPay](https://pqsafe.xyz) — post-quantum safe payments for AI crews.

[![PyPI version](https://img.shields.io/pypi/v/crewai-pqsafe.svg)](https://pypi.org/project/crewai-pqsafe/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What it does

`PQSafePaymentTool` extends CrewAI's `BaseTool`. Attach it to any CrewAI agent and it gains the ability to execute payments bounded by a **PQ-signed SpendEnvelope** — an ML-DSA-65 authorization token that enforces recipient allowlist, amount ceiling, currency, and validity window.

## Install

```bash
pip install crewai-pqsafe
# with HTTP mode support:
pip install "crewai-pqsafe[http]"
# or editable install from source:
pip install -e integrations/crewai
```

## Usage

```python
from crewai import Agent
from crewai_pqsafe import PQSafePaymentTool

# Attach to a CrewAI agent
finance_agent = Agent(
    role="Finance Agent",
    goal="Process approved supplier payments",
    tools=[PQSafePaymentTool(mock_mode=True)],
)
```

## Mock mode

Run with no credentials — returns a synthetic `txId`:

```python
tool = PQSafePaymentTool(mock_mode=True)
result = tool._run(
    envelope_json='{"envelopeJson":"{...}","signature":"00..","dsaPublicKey":"ff.."}',
    recipient="GB29NWBK60161331926819",
    amount=150.0,
    memo="Invoice #42",
)
# "Payment successful (mock). txId=mock_abc123 ..."
```

Run the example:

```bash
python examples/procurement_agent.py
# PQSAFE_MOCK=false python examples/procurement_agent.py  (live)
```

## Production (HTTP mode)

```python
import os
os.environ["PQSAFE_API_URL"] = "https://api.pqsafe.xyz/v1/pay"

tool = PQSafePaymentTool(mode="http")  # calls REST API
```

## Subprocess mode (local SDK, dev only)

```python
# Requires: Node.js >= 18, npm install @pqsafe/agent-pay
tool = PQSafePaymentTool(mode="subprocess")  # shells out to Node.js SDK
```

## Tool input

The CrewAI framework passes these fields to the tool:

| Field | Type | Required | Description |
|---|---|---|---|
| `envelope_json` | str | Yes | Serialized `SignedEnvelope` JSON |
| `recipient` | str | Yes | Rail-specific recipient address |
| `amount` | float | Yes | Amount in envelope's currency (> 0) |
| `memo` | str | No | Human-readable reference |

## Guard rails

All constraints are enforced before any payment:

| Check | Where enforced |
|---|---|
| ML-DSA-65 signature | PQSafe SDK / API |
| Recipient in allowlist | PQSafe SDK / API |
| Amount ≤ maxAmount | PQSafe SDK / API |
| Envelope not expired | PQSafe SDK / API |

## Related

- [`@pqsafe/agent-pay`](../../README.md) — core TypeScript SDK
- [`@pqsafe/agent-pay-langchain`](../langchain/) — LangChain integration
- [`@pqsafe/mcp-server`](../mcp/) — MCP server for Claude Desktop / Cursor
