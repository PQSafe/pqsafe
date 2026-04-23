"""
PQSafePaymentTool — CrewAI BaseTool wrapper for PQSafe AgentPay.

Allows any CrewAI agent to execute post-quantum-authorized payments
by calling `pqsafe_pay` as a native crew tool.

Built on `@pqsafe/agent-pay` — see github.com/PQSafe/pqsafe
"""

from __future__ import annotations

import json
from typing import Optional, Type

import requests
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

PQSAFE_API_URL = "https://api.pqsafe.xyz/v1/pay"


class PQSafePaymentInput(BaseModel):
    """Input schema for the PQSafe payment tool."""

    envelope_json: str = Field(
        description=(
            "A PQSafe SignedEnvelope as a JSON string. "
            "Fields required: envelopeJson, signature, dsaPublicKey."
        )
    )
    recipient: str = Field(
        description="Recipient address in the rail-specific format (IBAN, crypto address, etc.)."
    )
    amount: float = Field(
        description="Amount to pay, in the currency declared by the envelope. Must be > 0.",
        gt=0,
    )
    memo: Optional[str] = Field(
        default=None,
        description="Optional human-readable reference attached to the payment.",
    )


def _execute_payment(
    signed_envelope: dict,
    recipient: str,
    amount: float,
    memo: Optional[str],
) -> dict:
    """
    POST to the PQSafe REST API and return {txId, status, rail}.
    Raises requests.HTTPError on non-2xx response.
    """
    payload = {
        "signedEnvelope": signed_envelope,
        "request": {
            "recipient": recipient,
            "amount": amount,
            **({"memo": memo} if memo else {}),
        },
    }
    response = requests.post(PQSAFE_API_URL, json=payload, timeout=30)
    response.raise_for_status()
    data = response.json()
    return {
        "txId": data.get("txId", ""),
        "status": data.get("status", "unknown"),
        "rail": data.get("rail", "unknown"),
    }


class PQSafePaymentTool(BaseTool):
    """
    CrewAI tool that executes a PQ-authorized payment via PQSafe AgentPay.

    Attach this tool to any CrewAI Agent to give it the ability to pay
    suppliers, contractors, or services using a pre-authorized SpendEnvelope.

    The envelope enforces: allowed recipients, max spend, currency, and
    validity window — PQSafe verifies all constraints server-side before
    executing the payment.

    Example::

        from crewai import Agent
        from crewai_pqsafe import PQSafePaymentTool

        finance_agent = Agent(
            role="Finance Agent",
            goal="Process approved supplier payments",
            tools=[PQSafePaymentTool()],
        )
    """

    name: str = "pqsafe_pay"
    description: str = (
        "Execute a post-quantum-authorized payment using PQSafe AgentPay. "
        "Provide a signed SpendEnvelope (envelope_json), recipient address, "
        "amount, and optional memo. Returns transaction ID, status, and rail. "
        "Payment is rejected server-side if recipient or amount violates the envelope."
    )
    args_schema: Type[BaseModel] = PQSafePaymentInput

    def _run(
        self,
        envelope_json: str,
        recipient: str,
        amount: float,
        memo: Optional[str] = None,
    ) -> str:
        """Execute the payment and return a human-readable result string."""
        try:
            signed_envelope = json.loads(envelope_json)
        except json.JSONDecodeError as exc:
            return f"Error: envelope_json is not valid JSON — {exc}"

        try:
            result = _execute_payment(signed_envelope, recipient, amount, memo)
            return (
                f"Payment successful. "
                f"txId={result['txId']} status={result['status']} rail={result['rail']}"
            )
        except requests.HTTPError as exc:
            return f"Payment failed (HTTP {exc.response.status_code}): {exc.response.text}"
        except requests.RequestException as exc:
            return f"Payment failed (network error): {exc}"
