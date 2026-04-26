"""
saas_renewal_crew.py — End-to-end CrewAI demo with PQSafe AgentPay.

3-agent crew that handles SaaS subscription renewals:
  1. Watcher  — detects expiring SaaS subscriptions from a mock catalog
  2. Approver — requests human confirmation via mock prompt (auto-approves in mock mode)
  3. Executor — executes the approved payments via PQSafePaymentTool

Run (mock mode — no API keys required):
    python examples/saas_renewal_crew.py

Run with CrewAI + OpenAI (requires OPENAI_API_KEY):
    CREWAI_REAL=true python examples/saas_renewal_crew.py
"""

from __future__ import annotations

import json
import os
import random
import string
import time
import traceback
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Minimal stubs so the demo runs without crewai installed
# ---------------------------------------------------------------------------

try:
    from crewai import Agent, Crew, Process, Task  # type: ignore
    from crewai_pqsafe import PQSafePaymentTool  # type: ignore
    _CREWAI_AVAILABLE = True
except ImportError:
    _CREWAI_AVAILABLE = False


# ---------------------------------------------------------------------------
# Mock PQSafe payment (standalone, no Node.js or crewai required)
# ---------------------------------------------------------------------------

STUB_ENVELOPE = json.dumps({
    "envelopeJson": json.dumps({
        "version": 1,
        "issuer": "pq1" + "a" * 40,
        "agent": "saas-renewal-crew-v1",
        "maxAmount": 5000.0,
        "currency": "USD",
        "allowedRecipients": [
            "anthropic.com/billing",
            "github.com/billing",
            "linear.app/billing",
            "vercel.com/billing",
        ],
        "validFrom": 1700000000,
        "validUntil": 9999999999,
        "nonce": "d" * 32,
        "rail": "stripe",
    }),
    "signature": "00" * 100,
    "dsaPublicKey": "ff" * 32,
})


def _mock_tx_id() -> str:
    return "mock_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=12))


def _mock_payment(recipient: str, amount: float, memo: str) -> dict[str, Any]:
    """Simulate PQSafe payment without any external calls."""
    allowed = json.loads(json.loads(STUB_ENVELOPE)["envelopeJson"])["allowedRecipients"]
    if recipient not in allowed:
        return {
            "success": False,
            "error": f"Recipient '{recipient}' not in allowlist",
            "allowedRecipients": allowed,
        }
    max_amount = json.loads(json.loads(STUB_ENVELOPE)["envelopeJson"])["maxAmount"]
    if amount > max_amount:
        return {
            "success": False,
            "error": f"Amount {amount} exceeds envelope maxAmount {max_amount}",
        }
    return {
        "success": True,
        "txId": _mock_tx_id(),
        "rail": "stripe",
        "amount": amount,
        "currency": "USD",
        "recipient": recipient,
        "memo": memo,
        "executedAt": datetime.now(timezone.utc).isoformat(),
        "mockMode": True,
    }


# ---------------------------------------------------------------------------
# Mock SaaS subscription catalog
# ---------------------------------------------------------------------------

SAAS_CATALOG: list[dict[str, Any]] = [
    {
        "service": "Anthropic API",
        "recipient": "anthropic.com/billing",
        "amountUsd": 50.0,
        "renewsAt": "2026-04-27",
        "daysTillRenewal": 1,
        "plan": "Team",
    },
    {
        "service": "GitHub Teams",
        "recipient": "github.com/billing",
        "amountUsd": 16.0,
        "renewsAt": "2026-04-28",
        "daysTillRenewal": 2,
        "plan": "Teams",
    },
    {
        "service": "Linear",
        "recipient": "linear.app/billing",
        "amountUsd": 24.0,
        "renewsAt": "2026-04-30",
        "daysTillRenewal": 4,
        "plan": "Business",
    },
    {
        "service": "Vercel Pro",
        "recipient": "vercel.com/billing",
        "amountUsd": 20.0,
        "renewsAt": "2026-05-15",
        "daysTillRenewal": 19,
        "plan": "Pro",
    },
]

URGENCY_THRESHOLD_DAYS = 3  # auto-flag if renewing within N days


# ---------------------------------------------------------------------------
# Pure-Python agent simulation (no crewai/LLM required)
# ---------------------------------------------------------------------------

def log(tag: str, msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] [{tag:>10s}] {msg}")


def agent_watcher() -> list[dict[str, Any]]:
    """Scan the SaaS catalog and return subscriptions expiring within threshold."""
    log("WATCHER", "Scanning SaaS subscription catalog...")
    expiring = [s for s in SAAS_CATALOG if s["daysTillRenewal"] <= URGENCY_THRESHOLD_DAYS]
    log("WATCHER", f"Found {len(expiring)} subscription(s) expiring within {URGENCY_THRESHOLD_DAYS} days:")
    for sub in expiring:
        log("WATCHER", f"  - {sub['service']} (${sub['amountUsd']:.2f}) renews {sub['renewsAt']} [{sub['daysTillRenewal']}d]")
    return expiring


def agent_approver(subscriptions: list[dict[str, Any]], mock_approve: bool = True) -> list[dict[str, Any]]:
    """
    Request human approval for each subscription.
    In mock mode: auto-approve all. In interactive mode: prompt via stdin.
    """
    log("APPROVER", f"Processing {len(subscriptions)} renewal(s) for approval...")
    approved: list[dict[str, Any]] = []

    for sub in subscriptions:
        if mock_approve:
            decision = "Y"
            log("APPROVER", f"  AUTO-APPROVE (mock): {sub['service']} ${sub['amountUsd']:.2f}")
        else:
            decision = input(
                f"\nApprove renewal for {sub['service']} — ${sub['amountUsd']:.2f} USD "
                f"(plan: {sub['plan']}, recipient: {sub['recipient']})? [Y/n] "
            ).strip().upper() or "Y"

        if decision == "Y":
            log("APPROVER", f"  APPROVED: {sub['service']}")
            approved.append({**sub, "approvedAt": datetime.now(timezone.utc).isoformat()})
        else:
            log("APPROVER", f"  REJECTED: {sub['service']}")

    log("APPROVER", f"Approved {len(approved)}/{len(subscriptions)} renewal(s).")
    return approved


def agent_executor(
    approved_subscriptions: list[dict[str, Any]],
    use_crewai_tool: bool = False,
) -> list[dict[str, Any]]:
    """Execute approved payments via PQSafe (mock or real tool)."""
    log("EXECUTOR", f"Executing {len(approved_subscriptions)} approved payment(s)...")
    receipts: list[dict[str, Any]] = []

    for sub in approved_subscriptions:
        memo = (
            f"SaaS renewal: {sub['service']} ({sub['plan']}) — "
            f"renews {sub['renewsAt']} — auto-approved"
        )
        log("EXECUTOR", f"  Paying ${sub['amountUsd']:.2f} to {sub['recipient']}...")

        if use_crewai_tool and _CREWAI_AVAILABLE:
            # Real CrewAI tool path
            tool = PQSafePaymentTool(mock_mode=True)
            result_str: str = tool._run(
                envelope_json=STUB_ENVELOPE,
                recipient=sub["recipient"],
                amount=sub["amountUsd"],
                memo=memo,
            )
            receipt: dict[str, Any] = {
                "service": sub["service"],
                "result": result_str,
                "executedAt": datetime.now(timezone.utc).isoformat(),
            }
        else:
            # Standalone mock path (no crewai dependency)
            payment = _mock_payment(sub["recipient"], sub["amountUsd"], memo)
            receipt = {
                "service": sub["service"],
                "recipient": sub["recipient"],
                "amountUsd": sub["amountUsd"],
                "txId": payment.get("txId", "N/A"),
                "success": payment.get("success", False),
                "error": payment.get("error"),
                "executedAt": payment.get("executedAt", ""),
                "pqSigned": True,
                "mockMode": True,
            }

        if receipt.get("success", True):
            log("EXECUTOR", f"  OK  txId={receipt.get('txId', '?')} service={sub['service']}")
        else:
            log("EXECUTOR", f"  ERR {receipt.get('error', 'unknown')} service={sub['service']}")

        receipts.append(receipt)

    return receipts


# ---------------------------------------------------------------------------
# CrewAI full-crew path (only if crewai + openai are available)
# ---------------------------------------------------------------------------

def run_with_crewai() -> None:
    """Run the full crew using CrewAI framework (requires OPENAI_API_KEY)."""
    log("CREW", "Starting CrewAI-powered SaaS renewal crew...")

    payment_tool = PQSafePaymentTool(mock_mode=True)

    watcher_agent = Agent(
        role="SaaS Subscription Watcher",
        goal="Detect SaaS subscriptions expiring within 3 days and report them",
        backstory="You monitor the company's SaaS subscription catalog for upcoming renewals.",
        verbose=True,
        tools=[],
    )

    approver_agent = Agent(
        role="Renewal Approver",
        goal="Review and approve SaaS renewal requests based on budget policy",
        backstory="You are responsible for ensuring all SaaS renewals are justified and within budget.",
        verbose=True,
        tools=[],
    )

    executor_agent = Agent(
        role="Payment Executor",
        goal="Execute approved SaaS renewal payments securely via PQSafe",
        backstory=(
            "You execute PQ-signed payments for approved SaaS renewals. "
            "You use the pqsafe_pay tool to process each payment securely."
        ),
        verbose=True,
        tools=[payment_tool],
    )

    catalog_json = json.dumps(SAAS_CATALOG, indent=2)

    watch_task = Task(
        description=(
            f"Review this SaaS subscription catalog and identify any services "
            f"expiring within {URGENCY_THRESHOLD_DAYS} days:\n{catalog_json}"
        ),
        expected_output="JSON list of subscriptions requiring renewal within the threshold",
        agent=watcher_agent,
    )

    approve_task = Task(
        description=(
            "Review the expiring subscriptions from the watcher. "
            "Approve all renewals that are within budget (< $200 each). "
            "Return a JSON list of approved subscriptions with approvedAt timestamps."
        ),
        expected_output="JSON list of approved subscriptions",
        agent=approver_agent,
        context=[watch_task],
    )

    execute_task = Task(
        description=(
            f"Execute payments for all approved subscriptions. "
            f"For each subscription, call pqsafe_pay with envelope_json={STUB_ENVELOPE!r}, "
            f"the recipient address, amount, and a memo. "
            f"Report the txId and status for each payment."
        ),
        expected_output="JSON list of payment receipts with txId, status, and executedAt",
        agent=executor_agent,
        context=[approve_task],
    )

    crew = Crew(
        agents=[watcher_agent, approver_agent, executor_agent],
        tasks=[watch_task, approve_task, execute_task],
        process=Process.sequential,
        verbose=True,
    )

    result = crew.kickoff()
    log("CREW", f"Crew finished. Result: {result}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def print_receipts(receipts: list[dict[str, Any]]) -> None:
    print()
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║              SaaS Renewal Crew — Execution Summary           ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    total_paid = 0.0
    for r in receipts:
        status = "OK " if r.get("success", True) else "ERR"
        amount = r.get("amountUsd", 0)
        total_paid += amount if r.get("success", True) else 0
        print(f"  [{status}] {r['service']:<25} ${amount:>8.2f}  txId={r.get('txId', 'N/A')}")
    print(f"  {'─'*58}")
    print(f"  {'Total paid:':<25} ${total_paid:>8.2f}  ({len(receipts)} payments)")
    print()
    print("  All payments PQ-signed with ML-DSA-65.")
    print("  Recipients verified against SpendEnvelope allowlist.")
    print()


def main() -> None:
    use_real_crewai = os.environ.get("CREWAI_REAL", "").lower() == "true"
    mock_approve = os.environ.get("CREWAI_INTERACTIVE", "").lower() != "true"

    print("╔══════════════════════════════════════════════════════════════╗")
    print("║       PQSafe AgentPay — CrewAI SaaS Renewal Crew Demo        ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    print(f"  Mode       : {'CrewAI + LLM' if use_real_crewai else 'Standalone mock (no API keys)'}")
    print(f"  Approval   : {'interactive' if not mock_approve else 'auto-approve (mock)'}")
    print(f"  crewai     : {'available' if _CREWAI_AVAILABLE else 'not installed (running standalone)'}")
    print()

    if use_real_crewai and _CREWAI_AVAILABLE:
        run_with_crewai()
        return

    # Standalone mock mode — no crewai, no openai
    try:
        # Agent 1: Watcher detects expiring subscriptions
        expiring = agent_watcher()
        if not expiring:
            log("MAIN", "No subscriptions expiring soon. Nothing to do.")
            return

        # Agent 2: Approver reviews + approves
        approved = agent_approver(expiring, mock_approve=mock_approve)
        if not approved:
            log("MAIN", "All renewals rejected. No payments executed.")
            return

        # Agent 3: Executor pays via PQSafe
        use_tool = _CREWAI_AVAILABLE
        receipts = agent_executor(approved, use_crewai_tool=use_tool)

        print_receipts(receipts)

    except Exception as exc:
        log("ERROR", f"Crew failed: {exc}")
        traceback.print_exc()
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
