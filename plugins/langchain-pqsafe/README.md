# langchain-pqsafe

[![PyPI](https://img.shields.io/pypi/v/langchain-pqsafe)](https://pypi.org/project/langchain-pqsafe/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Drop post-quantum signed payments into any LangChain agent in one line — FIPS 204 (ML-DSA-65) enforced.**

Part of the [PQSafe AgentPay](https://github.com/PQSafe/pqsafe) ecosystem. Built on [`pqsafe-agent-pay`](https://pypi.org/project/pqsafe-agent-pay/).

---

## What it does

`langchain-pqsafe` provides `PQSafePaymentTool`, a LangChain `BaseTool` that gives your agent the ability to make payments authorized by a **signed SpendEnvelope** — a post-quantum (ML-DSA-65, NIST FIPS 204) token issued by the human wallet owner. Add the tool to your agent's tool list and every `pqsafe_pay` tool call is automatically signature-verified and policy-enforced before any payment is dispatched.

No long-lived API keys in your agent code. No credentials to rotate. The envelope constrains exactly what the agent can spend, to whom, via which rail, and for how long — and it cannot be forged or exceeded.

---

## Install

```bash
pip install langchain-pqsafe
```

---

## Quickstart

```python
from langchain_pqsafe import PQSafePaymentTool
from langchain.agents import create_react_agent
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o")
agent = create_react_agent(llm, tools=[PQSafePaymentTool()])
```

That's it. The agent can now call `pqsafe_pay` whenever it needs to make a payment authorized by a SpendEnvelope.

---

## Full example

```python
import json
from langchain_pqsafe import PQSafePaymentTool
from langchain.agents import AgentExecutor, create_react_agent
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate

# 1. Build the tool
payment_tool = PQSafePaymentTool()

# 2. Your signed envelope (issued by the wallet owner, stored securely)
signed_envelope = {
    "envelopeJson": '{"version":1,"issuer":"pq1...","agent":"research-agent-v1",...}',
    "signature": "deadbeef...",
    "dsaPublicKey": "cafebabe...",
}
envelope_json = json.dumps(signed_envelope)

# 3. Create the agent — the envelope is injected into the prompt context
llm = ChatOpenAI(model="gpt-4o", temperature=0)
prompt = PromptTemplate.from_template(
    "You are a payment agent. Use pqsafe_pay to pay invoices.\n"
    "Envelope: {envelope_json}\n\n{agent_scratchpad}"
)
agent = create_react_agent(llm, tools=[payment_tool], prompt=prompt)
executor = AgentExecutor(agent=agent, tools=[payment_tool], verbose=True)

# 4. Run — the agent will call pqsafe_pay with the envelope automatically
result = executor.invoke({
    "envelope_json": envelope_json,
    "input": "Renew Perplexity Pro at perplexity.ai — $20 USD for research-agent-v1",
})
print(result["output"])
# Payment successful. txId=airwallex-tx-abc123 status=success rail=airwallex
```

---

## How it works

1. A human wallet owner issues a **signed SpendEnvelope** using `pqsafe-agent-pay` (or the PQSafe wallet). The envelope encodes: agent ID, max amount, allowed recipients, currency, and validity window — all bound by an ML-DSA-65 post-quantum signature.
2. The envelope is passed to the LangChain agent as prompt context (or tool input). It travels with the agent's context, not stored in the tool.
3. When the LLM decides to pay, it calls the `pqsafe_pay` tool with `envelope_json`, `recipient`, `amount`, and optional `memo`.
4. `PQSafePaymentTool` verifies the post-quantum signature server-side, enforces all policy constraints, and routes the payment to the cheapest available rail (Airwallex, Wise, Stripe, USDC/Base, or x402).
5. The tool returns a string: `Payment successful. txId=<id> status=<status> rail=<rail>` — which the LLM can include in its final answer.

---

## What you get

- **One-line integration** — `tools=[PQSafePaymentTool()]` is all it takes
- **FIPS 204 ML-DSA-65 enforcement** — every payment is quantum-resistant by default
- **Policy guardrails** — amount ceiling, recipient allowlist, and time window enforced before dispatch; the LLM cannot overspend
- **Multi-rail routing** — Airwallex (live sandbox), Wise, Stripe, USDC on Base, x402
- **No credentials in agent code** — only the short-lived signed envelope is required at runtime
- **Compatible with any LangChain agent** — ReAct, OpenAI Functions, Structured Chat, and custom agent types

---

## Tool schema

| Parameter | Type | Required | Description |
|---|---|---|---|
| `envelope_json` | `str` | Yes | `SignedEnvelope` serialized as JSON |
| `recipient` | `str` | Yes | Recipient address (IBAN, crypto addr, domain, etc.) |
| `amount` | `float` | Yes | Amount in the envelope's currency (> 0) |
| `memo` | `str` | No | Human-readable payment reference |

Returns a string: `Payment successful. txId=<id> status=<status> rail=<rail>`

---

## Part of PQSafe AgentPay

- **[`pqsafe-agent-pay`](https://pypi.org/project/pqsafe-agent-pay/)** — Python SDK (envelope creation, signing, verification) — this plugin's dependency
- **[`crewai-pqsafe`](https://pypi.org/project/crewai-pqsafe/)** — same pattern for CrewAI agents
- **[`@pqsafe/agent-pay`](https://www.npmjs.com/package/@pqsafe/agent-pay)** — core TypeScript SDK
- **[`@pqsafe/mastra`](https://www.npmjs.com/package/@pqsafe/mastra)** — Mastra workflow integration

---

## Links

- **Main repo:** [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe)
- **Docs:** [docs.pqsafe.xyz](https://docs.pqsafe.xyz)
- **Live demo:** [demo.pqsafe.xyz](https://demo.pqsafe.xyz)
- **Website:** [pqsafe.xyz](https://pqsafe.xyz)

---

## License

MIT
