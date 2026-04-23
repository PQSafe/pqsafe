# langchain-pqsafe

Post-quantum safe payments for LangChain agents, powered by [PQSafe AgentPay](https://pqsafe.xyz).

Built on `@pqsafe/agent-pay` — see [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe)

---

## Install

```bash
pip install langchain-pqsafe
```

## 5-line quick start

```python
from langchain_pqsafe import PQSafePaymentTool
from langchain.agents import create_react_agent
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o")
agent = create_react_agent(llm, tools=[PQSafePaymentTool()])
```

That's it. The agent can now call `pqsafe_pay` whenever it needs to make a payment authorized by a SpendEnvelope.

---

## How it works

1. A human wallet owner issues a **signed SpendEnvelope** — a post-quantum (ML-DSA-65) token that specifies: agent ID, max amount, allowed recipients, currency, and validity window.
2. The LangChain agent calls `pqsafe_pay` with the envelope, recipient, amount, and memo.
3. PQSafe verifies the envelope server-side and routes the payment over the cheapest available rail (Airwallex, Wise, Stripe, USDC/Base, or x402).
4. The tool returns `{txId, status, rail}`.

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
    "envelopeJson": '{"version":1,"issuer":"pq1...","agent":"my-agent",...}',
    "signature": "deadbeef...",
    "dsaPublicKey": "cafebabe...",
}
envelope_json = json.dumps(signed_envelope)

# 3. Create the agent
llm = ChatOpenAI(model="gpt-4o", temperature=0)
prompt = PromptTemplate.from_template(
    "You are a payment agent. Use pqsafe_pay to pay invoices.\n"
    "Envelope: {envelope_json}\n\n{agent_scratchpad}"
)
agent = create_react_agent(llm, tools=[payment_tool], prompt=prompt)
executor = AgentExecutor(agent=agent, tools=[payment_tool], verbose=True)

# 4. Run
result = executor.invoke({
    "envelope_json": envelope_json,
    "input": "Pay supplier GB29NWBK60161331926819 £150 for invoice #42",
})
print(result["output"])
```

---

## Tool schema

| Parameter | Type | Required | Description |
|---|---|---|---|
| `envelope_json` | `str` | Yes | SignedEnvelope serialized as JSON |
| `recipient` | `str` | Yes | Recipient address (IBAN, crypto addr, etc.) |
| `amount` | `float` | Yes | Amount in envelope's currency (> 0) |
| `memo` | `str` | No | Human-readable reference |

Returns a string: `Payment successful. txId=<id> status=<status> rail=<rail>`

---

## Links

- Documentation: [docs.pqsafe.xyz](https://docs.pqsafe.xyz)
- Website: [pqsafe.xyz](https://pqsafe.xyz)
- GitHub: [github.com/PQSafe/pqsafe](https://github.com/PQSafe/pqsafe)
- npm SDK: [`@pqsafe/agent-pay`](https://www.npmjs.com/package/@pqsafe/agent-pay)
