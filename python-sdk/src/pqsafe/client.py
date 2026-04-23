"""
PQSafe AgentPay — HTTP client.

Posts signed envelopes + payment requests to the PQSafe REST API.
Wire format: POST /v1/pay with JSON body {signedEnvelope, request}.

Matches the wire shape used by the LangChain, CrewAI, and Mastra plugins.
"""

from __future__ import annotations

import os
from typing import Optional

import requests

from .types import PaymentRequest, PaymentResult, SignedEnvelope

_DEFAULT_BASE_URL = "https://api.pqsafe.xyz"
_PAY_PATH = "/v1/pay"
_DEFAULT_TIMEOUT = 30  # seconds


class PQSafeClient:
    """
    Low-level HTTP client for the PQSafe AgentPay API.

    Parameters
    ----------
    api_key : str | None
        Bearer token sent in the Authorization header. Reads PQSAFE_API_KEY
        from the environment if not provided explicitly.
    base_url : str
        Base URL of the PQSafe API (default: https://api.pqsafe.xyz).
    timeout : int
        HTTP timeout in seconds (default: 30).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = _DEFAULT_BASE_URL,
        timeout: int = _DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key = api_key or os.environ.get("PQSAFE_API_KEY")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # ------------------------------------------------------------------
    # Public methods
    # ------------------------------------------------------------------

    def pay(
        self,
        signed_envelope: SignedEnvelope,
        request: PaymentRequest,
    ) -> PaymentResult:
        """
        POST a payment to /v1/pay.

        Parameters
        ----------
        signed_envelope : SignedEnvelope
            The PQ-signed authorization envelope from sign_envelope().
        request : PaymentRequest
            The payment details (recipient, amount, memo).

        Returns
        -------
        PaymentResult
            Transaction ID, status, and rail from the API response.

        Raises
        ------
        requests.HTTPError
            On non-2xx HTTP response.
        requests.RequestException
            On network errors (timeout, DNS failure, etc.).
        ValueError
            If the API response is missing required fields.
        """
        payload = self._build_payload(signed_envelope, request)
        headers = self._build_headers()

        url = f"{self.base_url}{_PAY_PATH}"
        response = requests.post(url, json=payload, headers=headers, timeout=self.timeout)
        response.raise_for_status()

        data = response.json()
        return PaymentResult(
            tx_id=data.get("txId", ""),
            status=data.get("status", "unknown"),
            rail=data.get("rail", "unknown"),
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_payload(
        self,
        signed_envelope: SignedEnvelope,
        request: PaymentRequest,
    ) -> dict:
        """
        Build the JSON payload that matches the wire format expected by all
        PQSafe plugins (langchain-pqsafe, crewai-pqsafe, mastra-pqsafe).

        Shape: { signedEnvelope: {...}, request: {...} }
        """
        envelope_dict = {
            "envelopeJson": signed_envelope.envelope_json,
            "signature": signed_envelope.signature,
            "dsaPublicKey": signed_envelope.dsa_public_key,
        }
        request_dict: dict = {
            "recipient": request.recipient,
            "amount": request.amount,
        }
        if request.memo is not None:
            request_dict["memo"] = request.memo

        return {
            "signedEnvelope": envelope_dict,
            "request": request_dict,
        }

    def _build_headers(self) -> dict:
        headers: dict = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers


# ---------------------------------------------------------------------------
# Module-level convenience: reuses a default client instance
# ---------------------------------------------------------------------------

_default_client: Optional[PQSafeClient] = None


def _get_default_client(
    api_key: Optional[str] = None,
    base_url: str = _DEFAULT_BASE_URL,
) -> PQSafeClient:
    global _default_client
    if _default_client is None or api_key is not None or base_url != _DEFAULT_BASE_URL:
        _default_client = PQSafeClient(api_key=api_key, base_url=base_url)
    return _default_client
