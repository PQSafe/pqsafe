"""
simple_agent.py — minimal runnable example of PQSafePaymentTool in a ReAct agent.

Prerequisites:
    pip install langchain-pqsafe langchain langchain-openai
    export OPENAI_API_KEY=sk-...

Run:
    python examples/simple_agent.py
"""

import json
import os

from langchain.agents import AgentExecutor, create_react_agent
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI

from langchain_pqsafe import PQSafePaymentTool

# ---------------------------------------------------------------------------
# Stub envelope — replace with a real signed envelope from PQSafe CLI / SDK
# ---------------------------------------------------------------------------
STUB_ENVELOPE = {
    "envelopeJson": json.dumps({
        "version": 1,
        "issuer": "pq1" + "a" * 40,
        "agent": "simple-demo-agent",
        "maxAmount": 500.0,
        "currency": "USD",
        "allowedRecipients": ["acct_1ExampleStripe"],
        "validFrom": 1700000000,
        "validUntil": 9999999999,
        "nonce": "a" * 32,
    }),
    "signature": "00" * 100,    # placeholder — real signature required for live payments
    "dsaPublicKey": "ff" * 32,  # placeholder
}

PROMPT_TEMPLATE = PromptTemplate.from_template(
    "You are a payment agent with access to PQSafe AgentPay.\n"
    "Always use the signed envelope below when calling pqsafe_pay.\n\n"
    "Envelope JSON: {envelope_json}\n\n"
    "Tools: {tools}\n"
    "Tool names: {tool_names}\n\n"
    "Question: {input}\n"
    "Scratchpad: {agent_scratchpad}"
)


def main() -> None:
    payment_tool = PQSafePaymentTool()
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    agent = create_react_agent(llm, tools=[payment_tool], prompt=PROMPT_TEMPLATE)
    executor = AgentExecutor(agent=agent, tools=[payment_tool], verbose=True)

    result = executor.invoke({
        "envelope_json": json.dumps(STUB_ENVELOPE),
        "input": (
            "Pay acct_1ExampleStripe $49.99 USD for SaaS subscription invoice INV-2024-001."
        ),
    })
    print("\n=== Agent output ===")
    print(result["output"])


if __name__ == "__main__":
    if not os.environ.get("OPENAI_API_KEY"):
        print("Warning: OPENAI_API_KEY not set — agent LLM calls will fail.")
        print("Set the env var or swap ChatOpenAI for another LangChain LLM.")
    main()
