"""
PQSafe AgentPay — shared types and Pydantic models.

Field names mirror the TypeScript SDK (camelCase -> snake_case).
"""

from __future__ import annotations

import re
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Enums / literals
# ---------------------------------------------------------------------------

Rail = Literal["airwallex", "wise", "stripe", "usdc-base", "x402"]

# ---------------------------------------------------------------------------
# Core models
# ---------------------------------------------------------------------------


class SpendEnvelope(BaseModel):
    """
    A PQSafe spend authorization issued by a wallet owner to an AI agent.

    The envelope constrains which recipients may be paid, how much,
    in which currency, on which rail, and for how long. The issuer
    signs this envelope with their ML-DSA-65 key; the signature travels
    alongside the envelope in SignedEnvelope.

    Field names mirror the TypeScript SDK (camelCase converted to snake_case).
    """

    version: Literal[1] = 1
    """Schema version — must be 1."""

    issuer: str = Field(
        ...,
        description="PQSafe address of the human issuer (pq1 + 40 hex chars).",
    )
    """PQSafe wallet address of the issuer."""

    agent: str = Field(..., min_length=1, max_length=128)
    """Agent identifier — free-form string (e.g. 'raymond-ai-coo-v1')."""

    max_amount: float = Field(..., gt=0, alias="maxAmount")
    """Maximum total amount the agent may spend."""

    currency: str = Field(..., min_length=3, max_length=3)
    """ISO 4217 currency code (e.g. 'USD', 'HKD')."""

    allowed_recipients: List[str] = Field(..., min_length=1, alias="allowedRecipients")
    """
    Allowlist of recipients. Agent may ONLY pay to addresses in this list.
    Rail-specific format (IBAN, crypto address, etc.).
    Empty list = no recipients allowed.
    """

    valid_from: int = Field(..., gt=0, alias="validFrom")
    """Unix timestamp (seconds) — envelope not valid before this time."""

    valid_until: int = Field(..., gt=0, alias="validUntil")
    """Unix timestamp (seconds) — envelope expires after this time."""

    nonce: str = Field(...)
    """Random hex nonce (128-bit / 32 hex chars) to prevent replay attacks."""

    rail: Optional[Rail] = None
    """Optional: constrain to a specific payment rail. None = router chooses."""

    model_config = {
        "populate_by_name": True,  # accept both snake_case and camelCase
    }

    @field_validator("issuer")
    @classmethod
    def issuer_format(cls, v: str) -> str:
        if not re.match(r"^pq1[0-9a-f]{40}$", v):
            raise ValueError("issuer must match ^pq1[0-9a-f]{40}$")
        return v

    @field_validator("nonce")
    @classmethod
    def nonce_format(cls, v: str) -> str:
        if not re.match(r"^[0-9a-f]{32}$", v):
            raise ValueError("nonce must be 32 hex chars (128-bit)")
        return v

    @field_validator("currency")
    @classmethod
    def currency_upper(cls, v: str) -> str:
        return v.upper()


class SignedEnvelope(BaseModel):
    """
    A SpendEnvelope bundled with its ML-DSA-65 signature.

    This is what gets transmitted to the PQSafe API (POST /v1/pay).
    Field names intentionally match the TypeScript SDK wire format.
    """

    envelope_json: str = Field(..., alias="envelopeJson")
    """The canonical JSON of the SpendEnvelope (UTF-8, keys sorted)."""

    signature: str = Field(..., alias="signature")
    """ML-DSA-65 signature over envelope_json bytes, hex-encoded."""

    dsa_public_key: str = Field(..., alias="dsaPublicKey")
    """ML-DSA-65 public key of the issuer, hex-encoded."""

    model_config = {
        "populate_by_name": True,
    }


class PaymentRequest(BaseModel):
    """
    A payment request submitted by an AI agent.

    Mirrors TypeScript SDK PaymentRequest field-for-field.
    """

    recipient: str
    """Recipient address — rail-specific format (IBAN, crypto address, etc.)."""

    amount: float = Field(..., gt=0)
    """Amount in the envelope's currency. Must be positive."""

    memo: Optional[str] = None
    """Human-readable memo / reference attached to the payment."""


class PaymentResult(BaseModel):
    """
    Result returned by the PQSafe API after a successful payment.

    Mirrors TypeScript SDK PaymentResult.
    """

    tx_id: str = Field(..., alias="txId")
    """Rail-specific transaction ID."""

    status: str
    """Payment status (e.g. 'confirmed', 'pending')."""

    rail: str
    """Payment rail that executed the transaction."""

    model_config = {
        "populate_by_name": True,
    }
