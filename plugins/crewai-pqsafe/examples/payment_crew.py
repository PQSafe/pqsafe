"""
payment_crew.py — runnable CrewAI example with PQSafePaymentTool.

Prerequisites:
    pip install crewai-pqsafe crewai crewai-tools
    export OPENAI_API_KEY=sk-...

Run:
    python examples/payment_crew.py
"""

import json
import os

from crewai import Agent, Crew, Process, Task
from crewai_pqsafe import PQSafePaymentTool

# ---------------------------------------------------------------------------
# Stub envelope — replace with a real one from PQSafe CLI / SDK
# ---------------------------------------------------------------------------
STUB_ENVELOPE = json.dumps({
    "envelopeJson": json.dumps({
        "version": 1,
        "issuer": "pq1" + "a" * 40,
        "agent": "payment-crew-demo",
        "maxAmount": 1000.0,
        "currency": "USD",
        "allowedRecipients": ["acct_1ExampleStripe", "GB29NWBK60161331926819"],
        "validFrom": 1700000000,
        "validUntil": 9999999999,
        "nonce": "b" * 32,
    }),
    "signature": "00" * 100,    # placeholder — real signature required for live payments
    "dsaPublicKey": "ff" * 32,  # placeholder
})


def build_crew() -> Crew:
    payment_tool = PQSafePaymentTool()

    # Agent 1: Invoice reviewer — decides if payment is appropriate
    reviewer = Agent(
        role="Invoice Reviewer",
        goal="Review incoming invoices and approve or reject them",
        backstory=(
            "You are a careful finance reviewer. You approve invoices that "
            "match pre-approved suppliers and amounts."
        ),
        verbose=True,
    )

    # Agent 2: Finance executor — actually makes the payment
    executor = Agent(
        role="Finance Executor",
        goal="Execute approved payments using PQSafe AgentPay",
        backstory=(
            "You execute payments only after they have been reviewed and approved. "
            "You always use the PQSafe tool and report the txId."
        ),
        tools=[payment_tool],
        verbose=True,
    )

    review_task = Task(
        description=(
            "Review this invoice: Supplier GB29NWBK60161331926819, Amount £150, "
            "Memo 'SeniorDeli supplier invoice #42'. "
            "Confirm it is approved for payment. Output: APPROVED or REJECTED + reason."
        ),
        agent=reviewer,
        expected_output="APPROVED or REJECTED with a one-sentence reason",
    )

    pay_task = Task(
        description=(
            "If the invoice was approved, pay GB29NWBK60161331926819 £150 "
            "with memo 'SeniorDeli supplier invoice #42'. "
            f"Use this envelope: {STUB_ENVELOPE}"
        ),
        agent=executor,
        expected_output="Payment confirmation: txId, status, and rail used",
        context=[review_task],
    )

    return Crew(
        agents=[reviewer, executor],
        tasks=[review_task, pay_task],
        process=Process.sequential,
        verbose=True,
    )


def main() -> None:
    crew = build_crew()
    result = crew.kickoff()
    print("\n=== Crew result ===")
    print(result)


if __name__ == "__main__":
    if not os.environ.get("OPENAI_API_KEY"):
        print("Warning: OPENAI_API_KEY not set — LLM calls will fail.")
    main()
