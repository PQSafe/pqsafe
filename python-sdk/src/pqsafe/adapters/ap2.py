"""
PQSafe AgentPay — AP2 (Agentic Payments Protocol v0.3.0) adapter.

AP2 is an open protocol by Google / agentic-commerce defining structured
payment mandates that AI agents carry during commerce flows. PQSafe wraps
AP2 mandates with ML-DSA-65 post-quantum signatures, enabling agents to
prove spend authorization in a quantum-resistant way without modifying
the AP2 wire format.

Reference: https://github.com/google-agentic-commerce/AP2 (v0.3.0)

Mirrors TypeScript SDK ``src/adapters/ap2.ts`` API.

Functions
---------
ap2_mandate_to_spend_envelope(mandate, issuer_address, ttl_seconds=None)
    Convert an AP2 mandate (Intent, Cart, or Payment) to a PQSafe SpendEnvelope.

spend_envelope_to_ap2_mandate(env, mandate_type)
    Convert a PQSafe SpendEnvelope back into an AP2 mandate.

verify_ap2_with_pq_wrapper(mandate, pq_sig, pq_public_key)
    Verify an AP2 mandate's ML-DSA-65 PQSafe signature.
"""

from __future__ import annotations

import hashlib
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field

from ..canonical import canonical_json_bytes
from ..types import SpendEnvelope

# ---------------------------------------------------------------------------
# ML-DSA-65 constants
# ---------------------------------------------------------------------------

_ML_DSA65_SIG_BYTES = 3309
_ML_DSA65_PK_BYTES = 1952

# ---------------------------------------------------------------------------
# AP2 Pydantic models
# ---------------------------------------------------------------------------


class PaymentItem(BaseModel):
    """A payment item within a cart or order (mirrors AP2 / W3C PaymentItem)."""

    label: str
    """Human-readable item label."""

    amount: float
    """Per-unit amount."""

    currency: str
    """ISO 4217 currency code."""

    quantity: Optional[int] = None
    """Optional item quantity (default 1)."""

    sku: Optional[str] = None
    """Optional SKU or product identifier."""

    category: Optional[str] = None
    """Optional item category (e.g. 'physical', 'digital', 'service')."""

    metadata: Optional[Dict[str, Any]] = None
    """Optional merchant-specific metadata."""


class PaymentMethodData(BaseModel):
    """Payment method data — identifies the payment rail and associated credentials."""

    supported_methods: str = Field(..., alias="supportedMethods")
    """Rail identifier (e.g. 'stripe', 'wise', 'usdc-base', 'x402')."""

    data: Optional[Dict[str, Any]] = None
    """Rail-specific data object."""

    model_config = {"populate_by_name": True}


class ContactAddress(BaseModel):
    """Contact address — postal address of buyer or recipient."""

    recipient: Optional[str] = None
    address_line: List[str] = Field(..., alias="addressLine")
    city: str
    region: Optional[str] = None
    postal_code: Optional[str] = Field(None, alias="postalCode")
    country: str
    """ISO 3166-1 alpha-2 country code."""
    phone: Optional[str] = None

    model_config = {"populate_by_name": True}


class IntentMandate(BaseModel):
    """
    Intent Mandate — earliest stage of agentic commerce.

    Issued when the agent has expressed purchase intent but has not yet
    committed to a specific cart or price.
    """

    type: Literal["intent"] = "intent"
    mandate_id: str = Field(..., alias="mandateId")
    merchant_id: str = Field(..., alias="merchantId")
    description: str
    max_amount: float = Field(..., alias="maxAmount")
    currency: str
    expires_at: str = Field(..., alias="expiresAt")
    """ISO 8601 expiry datetime."""
    agent_id: str = Field(..., alias="agentId")
    issuer_address: str = Field(..., alias="issuerAddress")
    accepted_methods: Optional[List[PaymentMethodData]] = Field(None, alias="acceptedMethods")
    shipping_address: Optional[ContactAddress] = Field(None, alias="shippingAddress")
    metadata: Optional[Dict[str, Any]] = None

    model_config = {"populate_by_name": True}


class CartMandate(BaseModel):
    """
    Cart Mandate — mid-flow mandate with a concrete list of items.

    Issued after the agent has added items to a cart but before checkout.
    """

    type: Literal["cart"] = "cart"
    mandate_id: str = Field(..., alias="mandateId")
    merchant_id: str = Field(..., alias="merchantId")
    items: List[PaymentItem]
    subtotal: float
    tax: Optional[float] = None
    shipping: Optional[float] = None
    total: float
    currency: str
    expires_at: str = Field(..., alias="expiresAt")
    """ISO 8601 expiry datetime."""
    agent_id: str = Field(..., alias="agentId")
    issuer_address: str = Field(..., alias="issuerAddress")
    accepted_methods: Optional[List[PaymentMethodData]] = Field(None, alias="acceptedMethods")
    shipping_address: Optional[ContactAddress] = Field(None, alias="shippingAddress")
    metadata: Optional[Dict[str, Any]] = None

    model_config = {"populate_by_name": True}


class PaymentMandate(BaseModel):
    """
    Payment Mandate — final checkout stage with committed payment method.

    Issued when the agent is ready to execute a specific payment.
    """

    type: Literal["payment"] = "payment"
    mandate_id: str = Field(..., alias="mandateId")
    merchant_id: str = Field(..., alias="merchantId")
    amount: float
    currency: str
    payment_method: PaymentMethodData = Field(..., alias="paymentMethod")
    items: Optional[List[PaymentItem]] = None
    recipient_address: str = Field(..., alias="recipientAddress")
    expires_at: str = Field(..., alias="expiresAt")
    """ISO 8601 expiry datetime."""
    agent_id: str = Field(..., alias="agentId")
    issuer_address: str = Field(..., alias="issuerAddress")
    billing_address: Optional[ContactAddress] = Field(None, alias="billingAddress")
    shipping_address: Optional[ContactAddress] = Field(None, alias="shippingAddress")
    purchase_reference: Optional[str] = Field(None, alias="purchaseReference")
    metadata: Optional[Dict[str, Any]] = None

    model_config = {"populate_by_name": True}


AnyMandate = Union[IntentMandate, CartMandate, PaymentMandate]

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _nonce_from_string(s: str) -> str:
    """
    Derive a 128-bit nonce from an arbitrary string by SHA-256-hashing it
    and taking the first 16 bytes. Returns a 32-character lowercase hex string.

    Mirrors TypeScript SDK ``nonceFromString()``.
    """
    digest = hashlib.sha256(s.encode("utf-8")).digest()
    return digest[:16].hex()


def _iso_to_unix(iso: str) -> int:
    """
    Parse an ISO 8601 datetime string to a Unix timestamp (integer seconds).
    Raises ValueError if the string is not a valid date.
    """
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return int(dt.timestamp())
    except (ValueError, TypeError) as exc:
        raise ValueError(f"AP2 adapter: invalid ISO 8601 datetime {iso!r}") from exc


def _unix_to_iso(ts: int) -> str:
    """Convert a Unix timestamp (seconds) to an ISO 8601 UTC string."""
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------


def ap2_mandate_to_spend_envelope(
    mandate: AnyMandate,
    issuer_address: str,
    ttl_seconds: Optional[int] = None,
) -> SpendEnvelope:
    """
    Convert an AP2 mandate (Intent, Cart, or Payment) to a PQSafe SpendEnvelope.

    The adapter extracts the authorization bounds from the mandate and maps them
    to SpendEnvelope fields:
      - ``IntentMandate.max_amount`` → ``SpendEnvelope.max_amount``
      - ``CartMandate.total`` / ``PaymentMandate.amount`` → ``SpendEnvelope.max_amount``
      - ``PaymentMandate.recipient_address`` → ``SpendEnvelope.allowed_recipients``
      - ``mandate.currency`` → ``SpendEnvelope.currency``
      - ``mandate.agent_id`` → ``SpendEnvelope.agent``
      - ``mandate.expires_at`` (ISO 8601) → ``SpendEnvelope.valid_until`` (Unix seconds)

    For IntentMandate and CartMandate, ``allowed_recipients`` defaults to a single
    placeholder derived from ``merchant_id`` — the caller must replace this with
    the final recipient address before signing.

    Parameters
    ----------
    mandate : AnyMandate
        AP2 mandate to convert (Intent, Cart, or Payment).
    issuer_address : str
        PQSafe address of the human issuer (pq1 + 20-byte keccak hex).
    ttl_seconds : int | None
        Override TTL in seconds. If omitted, derived from ``mandate.expires_at``.
        Useful for extending short-lived AP2 mandates to match SpendEnvelope lifetime.

    Returns
    -------
    SpendEnvelope
        An unsigned SpendEnvelope ready for sign_envelope().

    Raises
    ------
    ValueError
        If mandate type is unrecognized or required fields are missing.
    """
    valid_from = int(time.time())

    # Derive validUntil from expiresAt or ttlSeconds override
    if ttl_seconds is not None:
        valid_until = valid_from + ttl_seconds
    else:
        valid_until = _iso_to_unix(mandate.expires_at)

    # Extract amount, currency, recipients based on mandate type
    if mandate.type == "intent":
        max_amount = mandate.max_amount
        currency = mandate.currency
        allowed_recipients = [mandate.merchant_id]
        nonce = _nonce_from_string(mandate.mandate_id)
    elif mandate.type == "cart":
        max_amount = mandate.total
        currency = mandate.currency
        allowed_recipients = [mandate.merchant_id]
        nonce = _nonce_from_string(mandate.mandate_id)
    elif mandate.type == "payment":
        max_amount = mandate.amount
        currency = mandate.currency
        allowed_recipients = [mandate.recipient_address]
        nonce = _nonce_from_string(mandate.mandate_id)
    else:
        raise ValueError(
            f"AP2 adapter: unrecognized mandate type {mandate.type!r}"  # type: ignore[union-attr]
        )

    return SpendEnvelope.model_validate({
        "version": 1,
        "issuer": issuer_address,
        "agent": mandate.agent_id,
        "maxAmount": max_amount,
        "currency": currency.upper(),
        "allowedRecipients": allowed_recipients,
        "validFrom": valid_from,
        "validUntil": valid_until,
        "nonce": nonce,
    })


def spend_envelope_to_ap2_mandate(
    env: SpendEnvelope,
    mandate_type: Literal["intent", "cart", "payment"],
) -> AnyMandate:
    """
    Convert a PQSafe SpendEnvelope back into an AP2 mandate.

    Useful for agents that receive a SpendEnvelope from a wallet and need to
    present a mandate to an AP2-aware merchant without stripping the PQ guarantees.
    The returned mandate retains a ``metadata.pq_nonce`` field containing
    the nonce of the envelope for auditability.

    Parameters
    ----------
    env : SpendEnvelope
        A validated SpendEnvelope (from verify_envelope()).
    mandate_type : Literal["intent", "cart", "payment"]
        Which AP2 mandate type to produce:
          - ``'intent'`` — builds an IntentMandate using max_amount as the ceiling.
          - ``'cart'`` — builds a CartMandate with a single synthetic line item.
          - ``'payment'`` — builds a PaymentMandate using allowed_recipients[0].
            Raises if allowed_recipients is empty.

    Returns
    -------
    AnyMandate
        The AP2 mandate object matching the requested type.

    Raises
    ------
    ValueError
        If mandate_type is 'payment' and env.allowed_recipients is empty.
    """
    expires_at = _unix_to_iso(env.valid_until)
    mandate_id = env.nonce
    merchant_id = env.allowed_recipients[0] if env.allowed_recipients else "unknown"

    if mandate_type == "intent":
        return IntentMandate.model_validate({
            "type": "intent",
            "mandateId": mandate_id,
            "merchantId": merchant_id,
            "description": f"Agent spend intent: up to {env.max_amount} {env.currency}",
            "maxAmount": env.max_amount,
            "currency": env.currency,
            "expiresAt": expires_at,
            "agentId": env.agent,
            "issuerAddress": env.issuer,
            "metadata": {
                "pqNonce": env.nonce,
                "pqIssuer": env.issuer,
            },
        })

    elif mandate_type == "cart":
        return CartMandate.model_validate({
            "type": "cart",
            "mandateId": mandate_id,
            "merchantId": merchant_id,
            "items": [
                {
                    "label": f"Authorized spend ({env.currency})",
                    "amount": env.max_amount,
                    "currency": env.currency,
                    "quantity": 1,
                }
            ],
            "subtotal": env.max_amount,
            "total": env.max_amount,
            "currency": env.currency,
            "expiresAt": expires_at,
            "agentId": env.agent,
            "issuerAddress": env.issuer,
            "metadata": {
                "pqNonce": env.nonce,
                "pqIssuer": env.issuer,
            },
        })

    elif mandate_type == "payment":
        if len(env.allowed_recipients) == 0:
            raise ValueError(
                "AP2 adapter: cannot build PaymentMandate — "
                "SpendEnvelope.allowed_recipients is empty"
            )
        return PaymentMandate.model_validate({
            "type": "payment",
            "mandateId": mandate_id,
            "merchantId": merchant_id,
            "amount": env.max_amount,
            "currency": env.currency,
            "paymentMethod": {
                "supportedMethods": env.rail if env.rail is not None else "pqsafe"
            },
            "recipientAddress": env.allowed_recipients[0],
            "expiresAt": expires_at,
            "agentId": env.agent,
            "issuerAddress": env.issuer,
            "metadata": {
                "pqNonce": env.nonce,
                "pqIssuer": env.issuer,
            },
        })

    else:
        raise ValueError(f"AP2 adapter: unrecognized mandate_type {mandate_type!r}")


def verify_ap2_with_pq_wrapper(
    mandate: AnyMandate,
    pq_sig: bytes,
    pq_public_key: bytes,
) -> bool:
    """
    Verify an AP2 mandate that has been extended with PQSafe's post-quantum
    signature wrapper.

    Verification steps:
      1. Validate mandate type (must be 'intent', 'cart', or 'payment').
      2. Validate signature length (3309 bytes for ML-DSA-65).
      3. Validate public key length (1952 bytes for ML-DSA-65).
      4. Serialize the mandate to RFC 8785 canonical JSON bytes.
      5. Verify the ML-DSA-65 signature over those bytes.

    Parameters
    ----------
    mandate : AnyMandate
        The AP2 mandate received from the agent (any type).
    pq_sig : bytes
        Raw ML-DSA-65 signature bytes (produced by PQSafe wallet).
    pq_public_key : bytes
        Raw ML-DSA-65 public key bytes of the issuer.

    Returns
    -------
    bool
        True if signature is valid.

    Raises
    ------
    ValueError
        If mandate type is unrecognized.
        If signature size is not exactly 3309 bytes.
        If public key size is not exactly 1952 bytes.
        If ML-DSA-65 signature verification fails.
    """
    # Validate mandate type
    if mandate.type not in ("intent", "cart", "payment"):
        raise ValueError(
            f"AP2 adapter: unrecognized mandate type {mandate.type!r}"  # type: ignore[union-attr]
        )

    # Validate sizes
    if len(pq_sig) != _ML_DSA65_SIG_BYTES:
        raise ValueError(
            f"AP2 adapter: invalid ML-DSA-65 signature length — "
            f"expected {_ML_DSA65_SIG_BYTES} bytes, got {len(pq_sig)}"
        )

    if len(pq_public_key) != _ML_DSA65_PK_BYTES:
        raise ValueError(
            f"AP2 adapter: invalid ML-DSA-65 public key length — "
            f"expected {_ML_DSA65_PK_BYTES} bytes, got {len(pq_public_key)}"
        )

    # Serialize mandate to canonical JSON (Pydantic model → dict → canonical bytes)
    mandate_dict = mandate.model_dump(by_alias=True, exclude_none=True)
    canonical_bytes = canonical_json_bytes(mandate_dict)

    # Verify using pqcrypto ML-DSA-65
    try:
        from pqcrypto.sign.ml_dsa_65 import verify as _ml_dsa_verify  # type: ignore[import]
        result = _ml_dsa_verify(pq_public_key, canonical_bytes, pq_sig)
        # pqcrypto may return True/False or raise on failure
        if isinstance(result, bool) and not result:
            raise ValueError(
                "AP2 adapter: ML-DSA-65 signature verification failed — "
                "mandate may have been tampered"
            )
        return True
    except ImportError:
        # Fallback: use the SDK's crypto module which handles backend selection
        from ..crypto import verify_bytes
        valid = verify_bytes(canonical_bytes, pq_sig, pq_public_key)
        if not valid:
            raise ValueError(
                "AP2 adapter: ML-DSA-65 signature verification failed — "
                "mandate may have been tampered"
            )
        return True
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(
            "AP2 adapter: ML-DSA-65 signature verification failed — "
            "mandate may have been tampered"
        ) from exc
