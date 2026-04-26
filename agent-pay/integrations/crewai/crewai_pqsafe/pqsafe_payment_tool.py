"""
PQSafePaymentTool — CrewAI BaseTool wrapper for PQSafe AgentPay.

Allows any CrewAI agent to execute post-quantum-authorized payments
by calling `pqsafe_pay` as a native crew tool.

Implementation strategy:
  - Mock mode (default, no credentials): returns synthetic results locally.
  - HTTP mode (production): POSTs to the PQSafe REST API at api.pqsafe.xyz/v1/pay.
  - Subprocess mode (dev): shells out to `npx tsx` with the @pqsafe/agent-pay SDK.
    Requires Node.js >= 18 and @pqsafe/agent-pay in the local node_modules.

Built on `@pqsafe/agent-pay` — see github.com/PQSafe/pqsafe
"""

from __future__ import annotations

import json
import os
import random
import string
import subprocess
import time
from typing import Optional, Type

try:
    import requests
    _REQUESTS_AVAILABLE = True
except ImportError:
    _REQUESTS_AVAILABLE = False

from crewai.tools import BaseTool
from pydantic import BaseModel, Field

PQSAFE_API_URL = os.environ.get("PQSAFE_API_URL", "https://api.pqsafe.xyz/v1/pay")


class PQSafePaymentInput(BaseModel):
    """Input schema for PQSafePaymentTool."""

    envelope_json: str = Field(
        description=(
            "A PQSafe SignedEnvelope serialized as a JSON string. "
            "Must contain fields: envelopeJson, signature, dsaPublicKey."
        )
    )
    recipient: str = Field(
        description="Recipient address — rail-specific format (IBAN, crypto address, Stripe customer ID, etc.)."
    )
    amount: float = Field(
        description="Amount to pay in the currency declared by the envelope. Must be > 0.",
        gt=0,
    )
    memo: Optional[str] = Field(
        default=None,
        description="Optional human-readable memo / reference attached to the payment.",
    )


def _mock_result(recipient: str, amount: float, envelope_json: str) -> dict:
    """Return a synthetic payment result for mock mode."""
    currency = "USD"
    try:
        signed = json.loads(envelope_json)
        inner = json.loads(signed.get("envelopeJson", "{}"))
        currency = inner.get("currency", "USD")
    except (json.JSONDecodeError, AttributeError, KeyError):
        pass

    tx_suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=12))
    return {
        "txId": f"mock_{tx_suffix}",
        "status": "settled",
        "rail": "airwallex",
        "amount": amount,
        "currency": currency,
        "recipient": recipient,
        "executedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "meta": {"mockMode": True},
    }


def _http_execute(
    signed_envelope: dict,
    recipient: str,
    amount: float,
    memo: Optional[str],
) -> dict:
    """
    POST a payment request to the PQSafe REST API.

    Requires: pip install requests
    Requires: PQSAFE_API_URL env var (default: https://api.pqsafe.xyz/v1/pay)

    Returns a dict with keys: txId, status, rail, amount, currency, recipient.
    Raises requests.HTTPError on non-2xx response.
    """
    if not _REQUESTS_AVAILABLE:
        raise ImportError(
            "HTTP mode requires the 'requests' package. Install: pip install requests"
        )

    import requests as _req

    payload = {
        "signedEnvelope": signed_envelope,
        "request": {
            "recipient": recipient,
            "amount": amount,
            **({"memo": memo} if memo else {}),
        },
    }
    response = _req.post(PQSAFE_API_URL, json=payload, timeout=30)
    response.raise_for_status()
    data = response.json()
    return {
        "txId": data.get("txId", ""),
        "status": data.get("status", "unknown"),
        "rail": data.get("rail", "unknown"),
        "amount": data.get("amount", amount),
        "currency": data.get("currency", ""),
        "recipient": data.get("recipient", recipient),
        "executedAt": data.get("executedAt", ""),
    }


def _subprocess_execute(
    signed_envelope: dict,
    recipient: str,
    amount: float,
    memo: Optional[str],
) -> dict:
    """
    Execute via the Node.js SDK using subprocess.

    Requires: Node.js >= 18, npm install @pqsafe/agent-pay in the caller's directory.

    This approach is suitable for development and demonstrations where the Python
    process shells out to the TypeScript SDK for local execution.
    For production, use HTTP mode (faster, no Node.js dependency).
    """
    sdk_script = """
import { executeAgentPayment } from '@pqsafe/agent-pay';
const signed = JSON.parse(process.env.PQSAFE_SIGNED_ENVELOPE);
const result = await executeAgentPayment(signed, {
  recipient: process.env.PQSAFE_RECIPIENT,
  amount: Number(process.env.PQSAFE_AMOUNT),
  ...(process.env.PQSAFE_MEMO ? { memo: process.env.PQSAFE_MEMO } : {}),
});
console.log(JSON.stringify(result));
"""
    env = {
        **os.environ,
        "PQSAFE_SIGNED_ENVELOPE": json.dumps(signed_envelope),
        "PQSAFE_RECIPIENT": recipient,
        "PQSAFE_AMOUNT": str(amount),
        **({"PQSAFE_MEMO": memo} if memo else {}),
    }
    result = subprocess.run(
        ["node", "--input-type=module"],
        input=sdk_script,
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Node.js SDK error: {result.stderr.strip()}")

    return json.loads(result.stdout.strip())


class PQSafePaymentTool(BaseTool):
    """
    CrewAI tool that executes a PQ-authorized payment via PQSafe AgentPay.

    Attach this tool to any CrewAI Agent to give it the ability to pay
    suppliers, contractors, or services using a pre-authorized SpendEnvelope.

    The envelope enforces: allowed recipients, max spend, currency, and
    validity window — verified by the PQSafe SDK / API before any payment.

    Modes:
      - mock_mode=True (default): returns synthetic results, no credentials needed.
      - mode='http': calls the PQSafe REST API (production).
      - mode='subprocess': shells out to Node.js SDK (dev / local testing).

    Example::

        from crewai import Agent
        from crewai_pqsafe import PQSafePaymentTool

        finance_agent = Agent(
            role="Finance Agent",
            goal="Process approved supplier payments",
            tools=[PQSafePaymentTool(mock_mode=True)],
        )
    """

    name: str = "pqsafe_pay"
    description: str = (
        "Execute a post-quantum-authorized payment using PQSafe AgentPay. "
        "Provide a signed SpendEnvelope (envelope_json), recipient address, "
        "amount, and optional memo. Returns transaction ID, status, and rail. "
        "Payment is rejected if recipient or amount violates the envelope constraints."
    )
    args_schema: Type[BaseModel] = PQSafePaymentInput

    mock_mode: bool = False
    mode: str = "http"  # "mock" | "http" | "subprocess"

    def __init__(self, mock_mode: bool = False, mode: str = "http", **kwargs):
        super().__init__(**kwargs)
        # Use object.__setattr__ to bypass pydantic immutability if needed
        object.__setattr__(self, "mock_mode", mock_mode)
        object.__setattr__(self, "mode", "mock" if mock_mode else mode)

    def _run(
        self,
        envelope_json: str,
        recipient: str,
        amount: float,
        memo: Optional[str] = None,
    ) -> str:
        """Execute the payment and return a human-readable result string."""
        # Parse envelope
        try:
            signed_envelope = json.loads(envelope_json)
        except json.JSONDecodeError as exc:
            return f"Error: envelope_json is not valid JSON — {exc}"

        effective_mode = self.mode

        # Mock mode — no network calls
        if effective_mode == "mock" or self.mock_mode:
            result = _mock_result(recipient, amount, envelope_json)
            return (
                f"Payment successful (mock). "
                f"txId={result['txId']} status={result['status']} "
                f"rail={result['rail']} amount={result['amount']} "
                f"{result['currency']} recipient={result['recipient']} "
                f"executedAt={result['executedAt']}"
            )

        # HTTP mode — call PQSafe REST API
        if effective_mode == "http":
            try:
                result = _http_execute(signed_envelope, recipient, amount, memo)
                return (
                    f"Payment successful. "
                    f"txId={result['txId']} status={result['status']} "
                    f"rail={result['rail']} amount={result['amount']} "
                    f"{result['currency']} executedAt={result['executedAt']}"
                )
            except Exception as exc:  # noqa: BLE001
                return f"Payment failed: {exc}"

        # Subprocess mode — shell out to Node.js SDK
        if effective_mode == "subprocess":
            try:
                result = _subprocess_execute(signed_envelope, recipient, amount, memo)
                return (
                    f"Payment successful. "
                    f"txId={result.get('txId', '')} rail={result.get('rail', '')} "
                    f"amount={result.get('amount', amount)} "
                    f"{result.get('currency', '')} "
                    f"executedAt={result.get('executedAt', '')}"
                )
            except Exception as exc:  # noqa: BLE001
                return f"Payment failed (subprocess): {exc}"

        return f"Error: unknown mode '{effective_mode}'. Use 'mock', 'http', or 'subprocess'."
