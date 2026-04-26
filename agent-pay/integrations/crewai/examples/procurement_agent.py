"""
procurement_agent.py — runnable CrewAI example with PQSafePaymentTool.

Demonstrates a 2-agent procurement crew:
  1. Invoice Reviewer — approves or rejects incoming supplier invoices.
  2. Finance Executor — pays approved invoices via PQSafe AgentPay.

Run in mock mode (no credentials needed):
    python examples/procurement_agent.py

Run with HTTP mode (requires PQSAFE_API_URL and a real signed envelope):
    PQSAFE_MOCK=false python examples/procurement_agent.py
"""

import json
import os

from crewai import Agent, Crew, Process, Task
from crewai_pqsafe import PQSafePaymentTool

# ---------------------------------------------------------------------------
# Stub envelope — replace with a real one from PQSafe CLI / SDK
# In production: generate via `createEnvelope + signEnvelope` from @pqsafe/agent-pay
# ---------------------------------------------------------------------------
STUB_ENVELOPE = json.dumps({
    "envelopeJson": json.dumps({
        "version": 1,
        "issuer": "pq1" + "a" * 40,
        "agent": "procurement-crew-demo",
        "maxAmount": 2000.0,
        "currency": "HKD",
        "allowedRecipients": [
            "GB29NWBK60161331926819",   # SeniorDeli supplier IBAN
            "HK12HSBC000123456789",      # Secondary supplier
        ],
        "validFrom": 1700000000,
        "validUntil": 9999999999,
        "nonce": "c" * 32,
        "rail": "airwallex",
    }),
    "signature": "00" * 100,    # placeholder — real ML-DSA-65 sig required for live payments
    "dsaPublicKey": "ff" * 32,  # placeholder
})

# ---------------------------------------------------------------------------
# Crew configuration
# ---------------------------------------------------------------------------

def build_procurement_crew(mock_mode: bool = True) -> Crew:
    payment_tool = PQSafePaymentTool(mock_mode=mock_mode)

    # Agent 1: Invoice reviewer — validates invoices against procurement rules
    reviewer = Agent(
        role="Procurement Reviewer",
        goal="Review supplier invoices and approve those that match pre-approved suppliers and amounts",
        backstory=(
            "You are a careful procurement reviewer at SeniorDeli. "
            "You approve invoices only from the pre-approved supplier list "
            "and only when amounts are within budget. "
            "You output APPROVED or REJECTED with a clear reason."
        ),
        verbose=True,
    )

    # Agent 2: Finance executor — executes approved payments
    executor = Agent(
        role="Finance Executor",
        goal="Execute approved supplier payments using PQSafe AgentPay and report the transaction ID",
        backstory=(
            "You execute payments only after they have been reviewed and approved. "
            "You use the PQSafe tool to make payments, and you always report "
            "the transaction ID and rail for the audit log."
        ),
        tools=[payment_tool],
        verbose=True,
    )

    # Task 1: Review the invoice
    review_task = Task(
        description=(
            "Review this supplier invoice:\n"
            "  Supplier: GB29NWBK60161331926819\n"
            "  Amount: HKD 1,500\n"
            "  Memo: SeniorDeli supplier invoice #88 — frozen dim sum delivery\n"
            "\n"
            "Check: (a) supplier is on the approved list, (b) amount ≤ HKD 2,000 budget.\n"
            "Output: APPROVED or REJECTED with one sentence reason."
        ),
        agent=reviewer,
        expected_output="APPROVED or REJECTED with a one-sentence reason",
    )

    # Task 2: Pay if approved
    pay_task = Task(
        description=(
            "If the invoice was approved in the previous task, execute the payment:\n"
            "  Recipient: GB29NWBK60161331926819\n"
            "  Amount: 1500 HKD\n"
            "  Memo: SeniorDeli supplier invoice #88\n"
            f"\nUse this signed SpendEnvelope:\n{STUB_ENVELOPE}\n"
            "\nReport: txId, status, and rail used."
        ),
        agent=executor,
        expected_output="Payment confirmation with txId, status, and rail, or rejection notice",
        context=[review_task],
    )

    return Crew(
        agents=[reviewer, executor],
        tasks=[review_task, pay_task],
        process=Process.sequential,
        verbose=True,
    )


def main() -> None:
    mock_mode = os.environ.get("PQSAFE_MOCK", "true").lower() != "false"

    print("=== PQSafe AgentPay — CrewAI Procurement Example ===")
    print(f"Mock mode: {'ON (no real payment)' if mock_mode else 'OFF (live)'}")
    print()

    if not os.environ.get("OPENAI_API_KEY"):
        print("Warning: OPENAI_API_KEY not set — LLM calls will fail.")
        print("Set the env var or update the agents to use a local LLM.")
        print()
        # Demo without LLM: just verify the tool is importable and callable
        print("--- Direct tool test (no LLM) ---")
        tool = PQSafePaymentTool(mock_mode=True)
        result = tool._run(
            envelope_json=STUB_ENVELOPE,
            recipient="GB29NWBK60161331926819",
            amount=1500.0,
            memo="SeniorDeli supplier invoice #88",
        )
        print("Tool result:", result)
        return

    crew = build_procurement_crew(mock_mode=mock_mode)
    result = crew.kickoff()
    print("\n=== Crew result ===")
    print(result)


if __name__ == "__main__":
    main()
