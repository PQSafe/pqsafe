"""
pqsafe-agent-pay — PQSafe AgentPay Python SDK

Post-quantum safe payments for AI agents.

Post-quantum signing uses ML-DSA-65 (NIST FIPS 204) via the pqcrypto library.
Falls back to classical Ed25519 if pqcrypto is unavailable (clearly marked).

Quick start
-----------
    from pqsafe import generate_keypair, create_envelope, sign_envelope, pay

    keypair = generate_keypair()

    envelope = create_envelope(
        issuer="pq1" + "a" * 40,
        agent="my-agent-v1",
        max_amount=100.0,
        currency="USD",
        allowed_recipients=["GB29NWBK60161331926819"],
    )

    signed = sign_envelope(envelope, keypair)

    result = pay(signed, {"recipient": "GB29NWBK60161331926819", "amount": 10.0})
    print(result.tx_id)

Links
-----
- Handbook: https://pqsafe.xyz/handbook
- TypeScript SDK: https://github.com/PQSafe/pqsafe/tree/main/agent-pay
"""

from __future__ import annotations

from typing import Optional, Union

from .client import PQSafeClient, _get_default_client
from .crypto import KeyPair, active_backend, generate_keypair
from .envelope import create_envelope, sign_envelope, verify_envelope
from .types import (
    PaymentRequest,
    PaymentResult,
    Rail,
    SignedEnvelope,
    SpendEnvelope,
)

__version__ = "0.1.0"
__all__ = [
    # Crypto
    "generate_keypair",
    "active_backend",
    "KeyPair",
    # Envelope
    "create_envelope",
    "sign_envelope",
    "verify_envelope",
    # Types
    "SpendEnvelope",
    "SignedEnvelope",
    "PaymentRequest",
    "PaymentResult",
    "Rail",
    # Client
    "pay",
    "PQSafeClient",
]


# ---------------------------------------------------------------------------
# Top-level pay() convenience function
# ---------------------------------------------------------------------------


def pay(
    signed_envelope: SignedEnvelope,
    request: Union[PaymentRequest, dict, None] = None,
    *,
    recipient: Optional[str] = None,
    amount: Optional[float] = None,
    memo: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: str = "https://api.pqsafe.xyz",
    dry_run: bool = False,
) -> PaymentResult:
    """
    Verify a PQ-signed SpendEnvelope and submit the payment to PQSafe.

    This is the primary public function. It mirrors executeAgentPayment()
    from the TypeScript SDK, with an added dry_run flag for local testing.

    Call styles supported:
      # Positional PaymentRequest object
      pay(signed, PaymentRequest(recipient="...", amount=10.0))

      # Plain dict (coerced automatically)
      pay(signed, {"recipient": "...", "amount": 10.0})

      # Keyword arguments (most concise)
      pay(signed, recipient="...", amount=10.0, memo="invoice #1")

    Parameters
    ----------
    signed_envelope : SignedEnvelope
        The PQ-signed authorization envelope (from sign_envelope()).
    request : PaymentRequest | dict | None
        The payment details. A plain dict is accepted for convenience and
        will be coerced into a PaymentRequest. If None, use keyword args.
    recipient : str | None
        Recipient address (keyword shorthand).
    amount : float | None
        Payment amount (keyword shorthand).
    memo : str | None
        Optional memo (keyword shorthand).
    api_key : str | None
        Bearer token. Falls back to PQSAFE_API_KEY env var if not provided.
    base_url : str
        PQSafe API base URL (default: https://api.pqsafe.xyz).
    dry_run : bool
        If True, skip the HTTP call and return a fake PaymentResult with
        tx_id='dry-run-no-http'. Useful for local testing when the API
        is not yet available.

    Returns
    -------
    PaymentResult
        Transaction ID, status, and rail.

    Raises
    ------
    ValueError
        If the envelope signature is invalid, or the payment request
        violates the envelope constraints (wrong recipient, amount too high).
    requests.HTTPError
        On non-2xx HTTP response from the PQSafe API.
    """
    # Build request from keyword args if not passed positionally
    if request is None:
        if recipient is None or amount is None:
            raise ValueError(
                "pay() requires either a PaymentRequest/dict as the second argument "
                "or keyword arguments: recipient= and amount="
            )
        request = PaymentRequest(recipient=recipient, amount=amount, memo=memo)
    elif isinstance(request, dict):
        request = PaymentRequest(**request)

    # Verify envelope signature (skip temporal check in dry_run for convenience)
    envelope = verify_envelope(signed_envelope, skip_temporal=dry_run)

    # Recipient allowlist check
    if request.recipient not in envelope.allowed_recipients:
        raise ValueError(
            f"PQSafe: recipient '{request.recipient}' is not in the envelope allowlist. "
            f"Allowed: {envelope.allowed_recipients}"
        )

    # Amount ceiling check
    if request.amount > envelope.max_amount:
        raise ValueError(
            f"PQSafe: requested amount {request.amount} {envelope.currency} "
            f"exceeds envelope max_amount {envelope.max_amount} {envelope.currency}"
        )

    if dry_run:
        return PaymentResult(
            tx_id="dry-run-no-http",
            status="dry_run",
            rail=envelope.rail or "airwallex",
        )

    client = _get_default_client(api_key=api_key, base_url=base_url)
    return client.pay(signed_envelope, request)
