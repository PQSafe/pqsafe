# crewai-pqsafe

[![PyPI](https://img.shields.io/pypi/v/crewai-pqsafe)](https://pypi.org/project/crewai-pqsafe/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Drop post-quantum signed payments into any CrewAI agent in one line — FIPS 204 (ML-DSA-65) enforced.**

Part of the [PQSafe AgentPay](https://github.com/PQSafe/pqsafe) ecosystem. Built on [`pqsafe-agent-pay`](https://pypi.org/project/pqsafe-agent-pay/).

---

## What it does

`crewai-pqsafe` provides `PQSafePaymentTool`, a CrewAI-compatible tool that gives your agents the ability to make payments authorized by a **signed SpendEnvelope** — a post-quantum (ML-DSA-65, NIST FIPS 204) token issued by the human operator. Add the tool to any CrewAI `Agent` and every `pqsafe_pay` call is signature-verified and policy-enforced before any payment is dispatched.

No long-lived API keys in your crew definition. No credentials to rotate. The envelope constrains exactly what the agent can spend, to whom, via which rail, and for how long — and it cannot be forged or exceeded.

---

## Install

```bash
pip install crewai-pqsafe
```

---

## Quickstart

```python
from crewai import Agent, Crew, Task
from crewai_pqsafe import PQSafePaymentTool

payment_tool = PQSafePaymentTool()

finance_agent = Agent(
    role="Finance Agent",
    goal="Process approved supplier payments autonomously",
    backstory="You pay invoices that have been pre-authorized via PQSafe SpendEnvelopes.",
    tools=[payment_tool],
)
```

That's it. The `finance_agent` can now call `pqsafe_pay` on any task that requires a payment.

---

## Full crew example

```python
import json
from crewai import Agent, Crew, Task
from crewai_pqsafe import PQSafePaymentTool

payment_tool = PQSafePaymentTool()

# Agent with payment capability
finance_agent = Agent(
    role="Finance Agent",
    goal="Process approved supplier payments",
    backstory="You pay invoices pre-authorized via PQSafe SpendEnvelopes.",
    tools=[payment_tool],
)

# Task — envelope is injected into the description at runtime
pay_invoice = Task(
    description=(
        "Renew the Perplexity Pro subscription at perplexity.ai — $20 USD. "
        "Use this signed envelope: {envelope_json}"
    ),
    agent=finance_agent,
    expected_output="Payment confirmation with txId, status, and rail",
)

crew = Crew(agents=[finance_agent], tasks=[pay_invoice])

# Kick off — inject the pre-signed envelope issued by the operator
signed_envelope = {
    "envelopeJson": '{"version":1,"issuer":"pq1...","agent":"finance-crew-v1",...}',
    "signature": "deadbeef...",
    "dsaPublicKey": "cafebabe...",
}
result = crew.kickoff(inputs={"envelope_json": json.dumps(signed_envelope)})
print(result)
# Payment successful. txId=airwallex-tx-abc123 status=success rail=airwallex
```

---

## How it works

1. A human operator issues a **signed SpendEnvelope** using `pqsafe-agent-pay` (or the PQSafe Chrome extension). The envelope encodes: agent ID, max amount, allowed recipients, currency, and validity window — all bound by an ML-DSA-65 post-quantum signature.
2. The envelope is passed into the crew as an input variable. It travels with the task context, not stored in the tool.
3. When the agent decides to pay, it calls the `pqsafe_pay` tool with `envelope_json`, `recipient`, `amount`, and optional `memo`.
4. `PQSafePaymentTool` verifies the post-quantum signature server-side, enforces all policy constraints, and routes the payment to the cheapest available rail (Airwallex, Wise, Stripe, USDC/Base, or x402).
5. The tool returns a string: `Payment successful. txId=<id> status=<status> rail=<rail>` — included in the task output.

---

## What you get

- **One-line integration** — `tools=[PQSafePaymentTool()]` on any CrewAI `Agent`
- **FIPS 204 ML-DSA-65 enforcement** — every payment is quantum-resistant by default
- **Policy guardrails** — amount ceiling, recipient allowlist, and time window enforced before dispatch; the agent cannot overspend
- **Multi-rail routing** — Airwallex (live sandbox), Wise, Stripe, USDC on Base, x402
- **No credentials in crew code** — only the short-lived signed envelope is required at runtime
- **Compatible with any CrewAI crew** — hierarchical, sequential, or custom process types

---

## Tool parameters

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
- **[`langchain-pqsafe`](https://pypi.org/project/langchain-pqsafe/)** — same pattern for LangChain agents
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
