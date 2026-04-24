# crewai-pqsafe

Post-quantum safe payments for CrewAI agents, powered by [PQSafe AgentPay](https://pqsafe.xyz).

Built on `@pqsafe/agent-pay` — see [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe)

---

## Install

```bash
pip install crewai-pqsafe
```

## Quick start — crew with a payment-capable agent

```python
from crewai import Agent, Crew, Task
from crewai_pqsafe import PQSafePaymentTool

payment_tool = PQSafePaymentTool()

finance_agent = Agent(
    role="Finance Agent",
    goal="Process approved supplier payments",
    backstory="You pay invoices that have been pre-authorized via PQSafe envelopes.",
    tools=[payment_tool],
)

pay_invoice = Task(
    description=(
        "Renew Perplexity Pro subscription at perplexity.ai — $20 USD. "
        "Use envelope: {envelope_json}"
    ),
    agent=finance_agent,
    expected_output="Payment confirmation with txId and rail",
)

crew = Crew(agents=[finance_agent], tasks=[pay_invoice])
result = crew.kickoff(inputs={"envelope_json": "<your signed envelope JSON>"})
print(result)
```

---

## How it works

1. A human wallet owner issues a **signed SpendEnvelope** — a post-quantum (ML-DSA-65) token constraining agent ID, max amount, allowed recipients, and validity window.
2. The CrewAI agent calls `pqsafe_pay` with the envelope, recipient, amount, and memo.
3. PQSafe verifies constraints server-side and routes the payment over the cheapest available rail (Airwallex, Wise, Stripe, USDC/Base, or x402).
4. The tool returns `{txId, status, rail}`.

---

## Tool parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `envelope_json` | `str` | Yes | SignedEnvelope as JSON string |
| `recipient` | `str` | Yes | Recipient address (IBAN, crypto addr, etc.) |
| `amount` | `float` | Yes | Amount in envelope's currency (> 0) |
| `memo` | `str` | No | Human-readable payment reference |

---

## Links

- Documentation: [docs.pqsafe.xyz](https://docs.pqsafe.xyz)
- Website: [pqsafe.xyz](https://pqsafe.xyz)
- GitHub: [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe)
- npm SDK: [`@pqsafe/agent-pay`](https://www.npmjs.com/package/@pqsafe/agent-pay)
