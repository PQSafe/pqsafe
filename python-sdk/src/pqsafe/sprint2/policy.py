"""
PQSafe AgentPay — Sprint 2: Spend Policy type definitions and validation.

IMPLEMENTATION STATUS: Types + validation implemented. No enforcement.
Enforcement (check-and-reserve CAS against the hosted issuer service) is
Sprint 2 production work — queued for May 5–18.

Three policy modes:

  single_use     — envelope authorizes exactly ONE payment; nonce is consumed
                   on first successful settlement. Default and backward-compatible
                   with all Sprint 1 envelopes.

  per_tx_cap     — envelope can be reused for multiple payments, each individually
                   capped at ``per_tx_limit``. Useful for recurring micro-payments
                   (e.g. x402 per-call billing).

  cumulative_cap — envelope tracks a running spend balance; payments are allowed
                   until ``max_amount`` is exhausted. Requires the hosted issuer
                   service to maintain the authoritative debit ledger.

Wire format: ``spend_policy`` is an optional field on SpendEnvelope v1.
Absence ≡ ``SingleUsePolicy(mode='single_use')`` for full backward compatibility.

Mirrors TypeScript SDK ``src/sprint2/policy.ts``.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Policy mode enum
# ---------------------------------------------------------------------------

class SpendPolicyMode(str, Enum):
    """The three supported spend policy modes."""

    SINGLE_USE = "single_use"
    PER_TX_CAP = "per_tx_cap"
    CUMULATIVE_CAP = "cumulative_cap"


# ---------------------------------------------------------------------------
# Per-mode policy Pydantic models
# ---------------------------------------------------------------------------

class SingleUsePolicy(BaseModel):
    """
    single_use: one payment, then the nonce is burned.
    No extra fields required.
    """

    mode: Literal["single_use"] = "single_use"


class PerTxCapPolicy(BaseModel):
    """
    per_tx_cap: each individual payment must be <= per_tx_limit.

    The envelope may be presented multiple times until it expires or is revoked.
    Requires the hosted issuer service to track nonce state.
    """

    mode: Literal["per_tx_cap"] = "per_tx_cap"
    per_tx_limit: float = Field(..., alias="perTxLimit", gt=0)
    """Maximum amount per individual payment (same currency as envelope.currency).
    Must be <= envelope.max_amount."""

    model_config = {"populate_by_name": True}

    @field_validator("per_tx_limit")
    @classmethod
    def per_tx_limit_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("per_tx_limit must be positive")
        return v


class CumulativeCapPolicy(BaseModel):
    """
    cumulative_cap: payments are allowed until the running total reaches
    envelope.max_amount. The hosted issuer service maintains the debit ledger.
    """

    mode: Literal["cumulative_cap"] = "cumulative_cap"
    reset_window_seconds: Optional[int] = Field(None, alias="resetWindowSeconds", gt=0)
    """
    Optional reset window in seconds. If set, the cumulative counter resets every
    ``reset_window_seconds``. Enables weekly/monthly budget envelopes.
    If omitted, the cap is lifetime (no reset).
    """

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Discriminated union
# ---------------------------------------------------------------------------

SpendPolicy = Union[SingleUsePolicy, PerTxCapPolicy, CumulativeCapPolicy]

# ---------------------------------------------------------------------------
# Default policy (backward compat)
# ---------------------------------------------------------------------------

DEFAULT_SPEND_POLICY: SingleUsePolicy = SingleUsePolicy(mode="single_use")
"""The default policy applied when spend_policy is omitted from the envelope."""

# ---------------------------------------------------------------------------
# SpendEnvelope extension fields for v2
# ---------------------------------------------------------------------------

class SpendEnvelopeExtV2(BaseModel):
    """
    The additional fields that Sprint 2 adds to SpendEnvelope.

    These are OPTIONAL so Sprint 1 envelopes remain valid (no migration needed).

    Usage (Sprint 2 production):
        Merge into the SpendEnvelope schema before validation.

    Until Sprint 2 production lands, these fields are accepted but not enforced.
    """

    spend_policy: Optional[SpendPolicy] = Field(None, alias="spendPolicy")
    """Spend policy for this envelope. Defaults to single_use if omitted."""

    client_request_id: Optional[str] = Field(None, alias="clientRequestId", min_length=1, max_length=128)
    """
    Caller-supplied idempotency key (separate from the nonce).
    Used by the hosted issuer service to deduplicate retry storms.
    Format: UUID v4 or opaque string <=128 chars.
    """

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def validate_spend_policy(raw: Any) -> SpendPolicy:
    """
    Validate a SpendPolicy object. Raises ValueError if structurally invalid.

    Used by the hosted issuer API to validate caller-supplied policies.

    Parameters
    ----------
    raw : Any
        A dict or SpendPolicy instance to validate.

    Returns
    -------
    SpendPolicy
        A validated SingleUsePolicy, PerTxCapPolicy, or CumulativeCapPolicy.

    Raises
    ------
    pydantic.ValidationError
        If ``raw`` is not a valid SpendPolicy.
    ValueError
        If ``mode`` field is missing or unrecognized.
    """
    if isinstance(raw, (SingleUsePolicy, PerTxCapPolicy, CumulativeCapPolicy)):
        return raw

    if not isinstance(raw, dict):
        raise ValueError(f"validate_spend_policy: expected dict or SpendPolicy, got {type(raw)!r}")

    mode = raw.get("mode")
    if mode == "single_use":
        return SingleUsePolicy.model_validate(raw)
    elif mode == "per_tx_cap":
        return PerTxCapPolicy.model_validate(raw)
    elif mode == "cumulative_cap":
        return CumulativeCapPolicy.model_validate(raw)
    else:
        raise ValueError(f"validate_spend_policy: unrecognized mode {mode!r}")


def effective_policy(envelope_fields: Dict[str, Any]) -> SpendPolicy:
    """
    Return the effective spend policy for an envelope, defaulting to single_use.

    Safe to call on Sprint 1 envelopes that have no spend_policy field.

    Parameters
    ----------
    envelope_fields : dict
        Dict with optional ``spend_policy`` key (from SpendEnvelope.model_dump()).

    Returns
    -------
    SpendPolicy
        The envelope's policy or DEFAULT_SPEND_POLICY if absent.
    """
    raw = envelope_fields.get("spend_policy") or envelope_fields.get("spendPolicy")
    if raw is None:
        return DEFAULT_SPEND_POLICY
    if isinstance(raw, (SingleUsePolicy, PerTxCapPolicy, CumulativeCapPolicy)):
        return raw
    return validate_spend_policy(raw)


def assert_policy_consistency(policy: SpendPolicy, max_amount: float) -> None:
    """
    Cross-field validation: verify that per_tx_limit does not exceed max_amount.

    Call this after parsing both envelope + policy.

    Parameters
    ----------
    policy : SpendPolicy
        The spend policy from the envelope.
    max_amount : float
        The envelope's max_amount field.

    Raises
    ------
    ValueError
        If policy is logically inconsistent with the envelope's max_amount.
    """
    if isinstance(policy, PerTxCapPolicy):
        per_tx = policy.per_tx_limit
        if per_tx > max_amount:
            raise ValueError(
                f"SpendPolicy.per_tx_limit ({per_tx}) must be <= "
                f"envelope.max_amount ({max_amount})"
            )
