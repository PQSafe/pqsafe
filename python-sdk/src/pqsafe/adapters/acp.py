"""
PQSafe AgentPay — Stripe ACP (Agent Commerce Protocol) adapter.

Stripe's Agent Commerce Protocol introduces Shared Payment Tokens (SPTs) —
a credential type that allows AI agents to be delegated limited payment
authority by a human user. SPTs carry usage limits (amount ceilings, allowed
merchants, expiry) in a Stripe-managed structure.

PQSafe wraps SPTs with ML-DSA-65 post-quantum signatures, providing a
cryptographic audit trail that survives Stripe's infrastructure.

Reference: https://stripe.com/docs/agent-commerce (ACP v1, 2025)

Mirrors TypeScript SDK ``src/adapters/acp.ts`` API.

Functions
---------
acp_token_to_spend_envelope(token, issuer_address, agent_id=None)
    Convert a Stripe Shared Payment Token to a PQSafe SpendEnvelope.

spend_envelope_to_acp_token(env, payment_method_id)
    Convert a PQSafe SpendEnvelope to Stripe SPT creation parameters.
"""

from __future__ import annotations

import hashlib
import warnings
from datetime import datetime, timezone
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from ..types import SpendEnvelope

# ---------------------------------------------------------------------------
# Zero-decimal currency guard
# ---------------------------------------------------------------------------

#: Currencies where Stripe's smallest unit is NOT cents.
#: For these, amounts are already in major units — do NOT divide by 100.
#: Source: https://stripe.com/docs/currencies#zero-decimal
_ZERO_DECIMAL_CURRENCIES = frozenset([
    "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
    "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
])

# ---------------------------------------------------------------------------
# Stripe ACP Pydantic models
# ---------------------------------------------------------------------------


class SharedPaymentTokenUsageLimits(BaseModel):
    """Usage limits applied to a Stripe Shared Payment Token."""

    max_total_amount: Optional[int] = Field(None, alias="maxTotalAmount")
    """Maximum total amount the token may authorize (smallest currency unit)."""

    max_amount_per_transaction: Optional[int] = Field(None, alias="maxAmountPerTransaction")
    """Maximum amount per individual transaction (smallest currency unit)."""

    allowed_merchant_categories: Optional[List[str]] = Field(None, alias="allowedMerchantCategories")
    """Allowed merchant category codes (ISO 18245 MCCs)."""

    allowed_merchants: Optional[List[str]] = Field(None, alias="allowedMerchants")
    """Explicit allowlist of Stripe merchant IDs (acct_*) that may charge this token."""

    blocked_merchants: Optional[List[str]] = Field(None, alias="blockedMerchants")
    """Explicit blocklist of Stripe merchant IDs that may NOT charge this token."""

    max_use_count: Optional[int] = Field(None, alias="maxUseCount")
    """Maximum number of times the token may be used."""

    expires_at: Optional[str] = Field(None, alias="expiresAt")
    """ISO 8601 datetime after which the token is expired."""

    allowed_countries: Optional[List[str]] = Field(None, alias="allowedCountries")
    """Allowed countries for merchant presence (ISO 3166-1 alpha-2)."""

    currency: Optional[str] = None
    """ISO 4217 currency code for usage limit amounts."""

    model_config = {"populate_by_name": True}


class SharedPaymentToken(BaseModel):
    """
    A Stripe Shared Payment Token — the credential Stripe issues when a user
    delegates limited payment authority to an AI agent.
    """

    id: str
    """Stripe SPT identifier (spt_*)."""

    object: str = "shared_payment_token"
    """Object type discriminator — always 'shared_payment_token'."""

    payment_method: str = Field(..., alias="paymentMethod")
    """Stripe-internal payment method the SPT draws from (pm_*)."""

    customer: str
    """The Stripe customer who owns this token (cus_*)."""

    agent_id: str = Field(..., alias="agentId")
    """Agent identifier this token was issued to."""

    usage_limits: Optional[SharedPaymentTokenUsageLimits] = Field(None, alias="usageLimits")
    """Usage constraints."""

    active: bool
    """Whether the token is currently active."""

    amount_used: int = Field(..., alias="amountUsed")
    """Running total of amounts authorized so far (smallest currency unit)."""

    currency: str
    """ISO 4217 currency code for all monetary fields in usageLimits."""

    created: int
    """Unix timestamp of creation."""

    last_used: Optional[int] = Field(None, alias="lastUsed")
    """Unix timestamp when the token was last used (None if never used)."""

    metadata: Optional[Dict[str, str]] = None
    """Stripe-managed metadata."""

    model_config = {"populate_by_name": True}


class CreateSharedPaymentTokenParams(BaseModel):
    """Parameters for creating a Shared Payment Token via the Stripe API."""

    payment_method: str = Field(..., alias="paymentMethod")
    """Stripe payment method ID to delegate (pm_*)."""

    customer: str
    """Stripe customer ID that owns the payment method (cus_*)."""

    agent_id: str = Field(..., alias="agentId")
    """Agent identifier (max 64 chars)."""

    currency: str
    """ISO 4217 currency code for usage limit amounts."""

    usage_limits: Optional[SharedPaymentTokenUsageLimits] = Field(None, alias="usageLimits")
    """Usage constraints on this token."""

    idempotency_key: Optional[str] = Field(None, alias="idempotencyKey")
    """Optional idempotency key to prevent duplicate token creation."""

    metadata: Optional[Dict[str, str]] = None
    """Optional key-value metadata."""

    pq_envelope_requested: Optional[bool] = Field(None, alias="pqEnvelopeRequested")
    """PQSafe extension: if true, Stripe API response includes a pq_envelope field."""

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _stripe_amount_to_major_unit(amount: int, currency: str) -> float:
    """
    Convert a Stripe API amount (smallest currency unit) to a major-unit amount.

    For standard currencies: divide by 100 (e.g. 1000 cents → 10.00 USD).
    For zero-decimal currencies (JPY, KRW, etc.): no conversion needed.
    """
    if currency.upper() in _ZERO_DECIMAL_CURRENCIES:
        return float(amount)
    return amount / 100.0


def _major_unit_to_stripe_amount(amount: float, currency: str) -> int:
    """
    Convert a major-unit amount to Stripe API smallest-currency-unit.

    For standard currencies: multiply by 100 (e.g. 10.00 USD → 1000 cents).
    For zero-decimal currencies (JPY, KRW, etc.): no conversion needed.
    """
    if currency.upper() in _ZERO_DECIMAL_CURRENCIES:
        return round(amount)
    return round(amount * 100)


def _iso_to_unix(iso: str) -> int:
    """Parse an ISO 8601 datetime string to a Unix timestamp (integer seconds)."""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return int(dt.timestamp())
    except (ValueError, TypeError) as exc:
        raise ValueError(f"ACP adapter: invalid ISO 8601 datetime {iso!r}") from exc


def _unix_to_iso(ts: int) -> str:
    """Convert a Unix timestamp (seconds) to an ISO 8601 UTC string."""
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _nonce_from_string(s: str) -> str:
    """
    Derive a 128-bit nonce from an arbitrary string by SHA-256-hashing it
    and taking the first 16 bytes. Returns a 32-character lowercase hex string.
    """
    digest = hashlib.sha256(s.encode("utf-8")).digest()
    return digest[:16].hex()


# ---------------------------------------------------------------------------
# Public functions
# ---------------------------------------------------------------------------


def acp_token_to_spend_envelope(
    token: SharedPaymentToken,
    issuer_address: str,
    agent_id: Optional[str] = None,
) -> SpendEnvelope:
    """
    Convert a Stripe Shared Payment Token to a PQSafe SpendEnvelope.

    Currency unit conversion: Stripe stores all amounts in the smallest currency
    unit (e.g. cents for USD/EUR/GBP). This adapter divides by 100 to produce a
    major-unit amount in the SpendEnvelope.

    EXCEPTION: Zero-decimal currencies (JPY, KRW, BIF, etc.) are NOT divided —
    Stripe stores them already in major units.

    Parameters
    ----------
    token : SharedPaymentToken
        A Stripe SharedPaymentToken retrieved from the Stripe API.
    issuer_address : str
        PQSafe address of the human issuer (pq1 + 20-byte keccak hex).
    agent_id : str | None
        Override for the agent identifier. If None, uses token.agent_id.

    Returns
    -------
    SpendEnvelope
        An unsigned SpendEnvelope ready for sign_envelope().

    Raises
    ------
    ValueError
        If token.active is False.
        If usageLimits.allowedMerchants is absent or empty.
        If no usable amount limit is set.
    """
    # Guard: deactivated token
    if not token.active:
        raise ValueError(
            f"ACP adapter: SPT {token.id!r} is deactivated — "
            "cannot create SpendEnvelope for inactive token"
        )

    # Guard: merchant allowlist required
    allowed_merchants = token.usage_limits.allowed_merchants if token.usage_limits else None
    if not allowed_merchants:
        raise ValueError(
            f"ACP adapter: SPT {token.id!r} has no allowedMerchants in usageLimits — "
            "PQSafe requires an explicit merchant allowlist"
        )

    # Resolve currency
    currency = (
        (token.usage_limits.currency if token.usage_limits and token.usage_limits.currency else None)
        or token.currency
    ).upper()

    # Resolve amount: prefer per-transaction limit, fall back to total limit
    raw_amount: Optional[int] = None
    if token.usage_limits:
        raw_amount = (
            token.usage_limits.max_amount_per_transaction
            or token.usage_limits.max_total_amount
        )

    if raw_amount is None or raw_amount <= 0:
        raise ValueError(
            f"ACP adapter: SPT {token.id!r} has no usable amount limit "
            "(maxAmountPerTransaction or maxTotalAmount required)"
        )

    max_amount = _stripe_amount_to_major_unit(raw_amount, currency)

    # Temporal bounds
    valid_from = token.created
    if token.usage_limits and token.usage_limits.expires_at:
        valid_until = _iso_to_unix(token.usage_limits.expires_at)
    else:
        # Default: 1 year from creation
        valid_until = token.created + 365 * 24 * 3600

    nonce = _nonce_from_string(token.id)

    return SpendEnvelope.model_validate({
        "version": 1,
        "issuer": issuer_address,
        "agent": agent_id if agent_id is not None else token.agent_id,
        "maxAmount": max_amount,
        "currency": currency,
        "allowedRecipients": allowed_merchants,
        "validFrom": valid_from,
        "validUntil": valid_until,
        "nonce": nonce,
        "rail": "stripe",
    })


def spend_envelope_to_acp_token(
    env: SpendEnvelope,
    payment_method_id: str,
) -> CreateSharedPaymentTokenParams:
    """
    Convert a PQSafe SpendEnvelope back into Stripe SPT creation parameters.

    Enables a workflow where an agent holds a SpendEnvelope and needs to obtain
    a Stripe SPT to actually charge a customer. The adapter translates envelope
    policy into SPT usage limits so the resulting SPT mirrors the human-approved
    spend bounds.

    Parameters
    ----------
    env : SpendEnvelope
        A validated SpendEnvelope (from verify_envelope()).
    payment_method_id : str
        Stripe payment method ID (pm_*) to attach to the SPT.

    Returns
    -------
    CreateSharedPaymentTokenParams
        Ready to POST to Stripe's /v1/shared_payment_tokens endpoint.

    Raises
    ------
    ValueError
        If env.allowed_recipients does not have exactly 1 entry.
    """
    if len(env.allowed_recipients) != 1:
        raise ValueError(
            f"ACP adapter: SPT is single-merchant — "
            f"SpendEnvelope.allowed_recipients must have exactly 1 entry, "
            f"got {len(env.allowed_recipients)}"
        )

    if env.rail is not None and env.rail != "stripe":
        warnings.warn(
            f"ACP adapter: SpendEnvelope.rail is {env.rail!r} but SPT creation targets "
            "Stripe — consider using rail='stripe'",
            UserWarning,
            stacklevel=2,
        )

    currency = env.currency.upper()
    stripe_amount = _major_unit_to_stripe_amount(env.max_amount, currency)

    return CreateSharedPaymentTokenParams.model_validate({
        "paymentMethod": payment_method_id,
        # customer is not stored in SpendEnvelope; issuer address used as proxy
        "customer": env.issuer,
        "agentId": env.agent,
        "currency": currency,
        "usageLimits": {
            "maxAmountPerTransaction": stripe_amount,
            "allowedMerchants": env.allowed_recipients,
            "expiresAt": _unix_to_iso(env.valid_until),
            "currency": currency,
        },
        "idempotencyKey": env.nonce,
    })
