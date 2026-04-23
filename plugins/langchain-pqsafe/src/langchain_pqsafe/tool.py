"""
PQSafePaymentTool — LangChain BaseTool wrapper for PQSafe AgentPay.

Wraps the PQSafe REST API so any LangChain agent can execute
post-quantum-authorized payments in a single tool call.

Built on `@pqsafe/agent-pay` — see github.com/PQSafe/pqsafe
"""

from __future__ import annotations

import json
from typing import Optional, Type

import requests
from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

PQSAFE_API_URL = "https://api.pqsafe.xyz/v1/pay"


class PQSafePaymentInput(BaseModel):
    """Input schema for PQSafePaymentTool."""

    envelope_json: str = Field(
        description=(
            "A PQSafe SignedEnvelope serialized as a JSON string. "
            "Must contain fields: envelopeJson, signature, dsaPublicKey."
        )
    )
    recipient: str = Field(
        description="Recipient address — rail-specific format (IBAN, crypto address, etc.)."
    )
    amount: float = Field(
        description="Amount to pay in the currency specified by the envelope (must be > 0).",
        gt=0,
    )
    memo: Optional[str] = Field(
        default=None,
        description="Human-readable memo / reference attached to the payment.",
    )


def _execute_payment(
    signed_envelope: dict,
    recipient: str,
    amount: float,
    memo: Optional[str],
) -> dict:
    """
    POST a payment request to the PQSafe REST API.

    Returns a dict with keys: txId, status, rail.
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
    LangChain tool that executes a PQ-authorized payment via PQSafe AgentPay.

    The agent must supply a signed SpendEnvelope (issued by the wallet owner)
    along with recipient, amount, and an optional memo. The envelope constrains
    which recipients and amounts are permitted — PQSafe verifies these server-side.

    Example usage inside a ReAct agent::

        from langchain_pqsafe import PQSafePaymentTool
        tool = PQSafePaymentTool()
        tools = [tool]
    """

    name: str = "pqsafe_pay"
    description: str = (
        "Execute a post-quantum-authorized payment using PQSafe AgentPay. "
        "Requires a signed SpendEnvelope (envelope_json), a recipient address, "
        "an amount, and an optional memo. Returns the transaction ID, status, "
        "and payment rail used. Only pays recipients pre-approved in the envelope."
    )
    args_schema: Type[BaseModel] = PQSafePaymentInput

    def _run(
        self,
        envelope_json: str,
        recipient: str,
        amount: float,
        memo: Optional[str] = None,
    ) -> str:
        """Execute the payment synchronously and return a human-readable result."""
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

    async def _arun(
        self,
        envelope_json: str,
        recipient: str,
        amount: float,
        memo: Optional[str] = None,
    ) -> str:
        """Async variant — delegates to sync for now (swap to httpx for production)."""
        return self._run(envelope_json, recipient, amount, memo)
