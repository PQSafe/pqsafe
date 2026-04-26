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
        allowed_recipients=["anthropic.com/billing"],
    )

    signed = sign_envelope(envelope, keypair)

    result = pay(signed, {"recipient": "anthropic.com/billing", "amount": 10.0})
    print(result.tx_id)

Links
-----
- Handbook: https://pqsafe.xyz/handbook
- TypeScript SDK: https://github.com/PQSafe/pqsafe/tree/main/agent-pay
"""

from __future__ import annotations

import os
import secrets
import time
from typing import Optional, Union

from .canonical import canonical_json_bytes, canonical_json_string
from .client import PQSafeClient, _get_default_client
from .crypto import KeyPair, active_backend, generate_keypair
from .envelope import create_envelope, sign_envelope, verify_envelope
from .errors import (
    AuthError,
    PolicyError,
    PQSafeError,
    RailError,
    RateLimitError,
    RevocationError,
    SignatureError,
    TemporalError,
    amount_exceeds_ceiling_error,
    envelope_expired_error,
    envelope_not_yet_active_error,
    recipient_not_allowed_error,
    signature_invalid_error,
)
from .types import (
    PaymentRequest,
    PaymentResult,
    Rail,
    SignedEnvelope,
    SpendEnvelope,
)

__version__ = "0.1.0"
__all__ = [
    # Canonical JSON (RFC 8785)
    "canonical_json_bytes",
    "canonical_json_string",
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
    # Errors
    "PQSafeError",
    "SignatureError",
    "PolicyError",
    "TemporalError",
    "RevocationError",
    "RailError",
    "RateLimitError",
    "AuthError",
    "signature_invalid_error",
    "recipient_not_allowed_error",
    "amount_exceeds_ceiling_error",
    "envelope_expired_error",
    "envelope_not_yet_active_error",
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
    mock_mode: Optional[bool] = None,
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
        Alias for mock_mode=True. Kept for backward compatibility.
    mock_mode : bool | None
        If True (or if PQSAFE_MOCK_MODE=1 env var is set), skip the HTTP
        call and return a realistic mock PaymentResult. All guardrails
        (signature, allowlist, ceiling) still run end-to-end. Useful for
        integration testing without live API credentials.

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

    # Determine if mock mode is active
    _mock = mock_mode if mock_mode is not None else dry_run
    if not _mock:
        _mock = os.environ.get("PQSAFE_MOCK_MODE") == "1"

    # Verify envelope signature (skip temporal check in mock/dry_run for convenience)
    envelope = verify_envelope(signed_envelope, skip_temporal=_mock)

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

    if _mock:
        rail = envelope.rail or "airwallex"
        prefix = {
            "airwallex": "awx_sbx",
            "wise": "wise_sbx",
            "usdc-base": "base_sbx",
            "stripe": "pi_sbx",
            "x402": "x402_sbx",
        }.get(rail, "sbx")
        mock_tx_id = f"{prefix}_{int(time.time() * 1000)}_{secrets.token_hex(4)}"
        return PaymentResult(
            tx_id=mock_tx_id,
            status="mock_confirmed",
            rail=rail,
        )

    client = _get_default_client(api_key=api_key, base_url=base_url)
    return client.pay(signed_envelope, request)
