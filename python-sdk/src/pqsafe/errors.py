"""
PQSafe AgentPay — Structured error hierarchy.

Mirrors TypeScript SDK ``src/sprint2/errors.ts`` exactly, including:

  - 9 ``ErrorClass`` values (SIGNATURE, POLICY, TEMPORAL, REVOCATION,
    RAIL, RATE_LIMIT, AUTH, INTERNAL, NOT_IMPL)
  - 30 ``PQSafeErrorCode`` values
  - ``PQSafeError`` base class with ``error_class``, ``code``,
    ``is_retriable``, ``retry_after_ms``, ``human_reason``, ``context``
  - 7 typed subclasses: ``SignatureError``, ``PolicyError``,
    ``TemporalError``, ``RevocationError``, ``RailError``,
    ``RateLimitError``, ``AuthError``
  - ``to_dict()`` method (JSON-serializable; mirrors TS ``toJSON()``)
  - Factory helpers: ``signature_invalid_error``,
    ``recipient_not_allowed_error``, ``amount_exceeds_ceiling_error``,
    ``envelope_expired_error``, ``envelope_not_yet_active_error``

Usage
-----
>>> from pqsafe.errors import PQSafeError, envelope_expired_error
>>> err = envelope_expired_error(valid_until=1700000000, now=1700003600)
>>> err.code
'ENVELOPE_EXPIRED'
>>> err.is_retriable
False
>>> err.to_dict()['error_class']
'TEMPORAL'

Motivation
----------
Raw ``ValueError("PQSafe: ...")`` strings are not machine-parseable. FI
integrations require structured errors for:

  - Circuit-breaker logic (``is_retriable`` + ``retry_after_ms``)
  - Incident triage (``error_class`` categorisation)
  - Compliance audit trails (``human_reason`` + ``context`` fields)
  - SDK consumer error handling without string matching
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, Literal, Optional, Type, Union

# ---------------------------------------------------------------------------
# ErrorClass
# ---------------------------------------------------------------------------

ErrorClass = Literal[
    "SIGNATURE",
    "POLICY",
    "TEMPORAL",
    "REVOCATION",
    "RAIL",
    "RATE_LIMIT",
    "AUTH",
    "INTERNAL",
    "NOT_IMPL",
]
"""
Broad category of error. Used for routing, alerting, and dashboard grouping.

  SIGNATURE    — cryptographic verification failures (never retriable)
  POLICY       — spend policy / allowlist / amount violations (never retriable
                 without a new envelope)
  TEMPORAL     — envelope time-window issues (may be retriable with new envelope)
  REVOCATION   — envelope revoked at any layer (never retriable)
  RAIL         — downstream payment rail failure (may be retriable)
  RATE_LIMIT   — hosted issuer API rate limit hit (retriable after retry_after_ms)
  AUTH         — API key / authentication failure (not retriable without new creds)
  INTERNAL     — unexpected internal error (retry with backoff, escalate if persistent)
  NOT_IMPL     — called a stub function not yet implemented (developer error)
"""

# ---------------------------------------------------------------------------
# PQSafeErrorCode
# ---------------------------------------------------------------------------

PQSafeErrorCode = Literal[
    # SIGNATURE errors
    "SIGNATURE_INVALID",
    "SIGNATURE_KEY_MISMATCH",
    "SIGNATURE_MALFORMED",
    # POLICY errors
    "POLICY_RECIPIENT_NOT_ALLOWED",
    "POLICY_AMOUNT_EXCEEDS_CEILING",
    "POLICY_AMOUNT_EXCEEDS_PER_TX_CAP",
    "POLICY_CUMULATIVE_CAP_EXHAUSTED",
    "POLICY_SINGLE_USE_ALREADY_SPENT",
    "POLICY_RAIL_NOT_ALLOWED",
    "POLICY_CURRENCY_MISMATCH",
    # TEMPORAL errors
    "ENVELOPE_NOT_YET_ACTIVE",
    "ENVELOPE_EXPIRED",
    # REVOCATION errors
    "REVOKED_EPOCH_ADVANCED",
    "REVOKED_GRANULAR",
    "REVOCATION_CHECK_FAILED_CLOSED",
    # RAIL errors
    "RAIL_CONNECTION_FAILED",
    "RAIL_PAYMENT_DECLINED",
    "RAIL_SETTLEMENT_PENDING",
    "RAIL_UNSUPPORTED",
    "RAIL_RECIPIENT_INVALID",
    # RATE_LIMIT errors
    "RATE_LIMIT_ISSUER_API",
    "RATE_LIMIT_ENVELOPE_CREATION",
    # AUTH errors
    "AUTH_API_KEY_INVALID",
    "AUTH_API_KEY_REVOKED",
    "AUTH_INSUFFICIENT_SCOPE",
    # INTERNAL errors
    "INTERNAL_SCHEMA_INVALID",
    "INTERNAL_UNEXPECTED",
    # NOT_IMPL errors
    "NOT_IMPLEMENTED",
]
"""
Fine-grained error code. Each code maps to exactly one ``ErrorClass``.
Codes are stable identifiers — safe for programmatic matching.
"""

# ---------------------------------------------------------------------------
# Error class lookup table  (mirrors ERROR_CLASS_MAP in TS)
# ---------------------------------------------------------------------------

_ERROR_CLASS_MAP: Dict[str, ErrorClass] = {
    "SIGNATURE_INVALID":             "SIGNATURE",
    "SIGNATURE_KEY_MISMATCH":        "SIGNATURE",
    "SIGNATURE_MALFORMED":           "SIGNATURE",

    "POLICY_RECIPIENT_NOT_ALLOWED":  "POLICY",
    "POLICY_AMOUNT_EXCEEDS_CEILING": "POLICY",
    "POLICY_AMOUNT_EXCEEDS_PER_TX_CAP": "POLICY",
    "POLICY_CUMULATIVE_CAP_EXHAUSTED": "POLICY",
    "POLICY_SINGLE_USE_ALREADY_SPENT": "POLICY",
    "POLICY_RAIL_NOT_ALLOWED":       "POLICY",
    "POLICY_CURRENCY_MISMATCH":      "POLICY",

    "ENVELOPE_NOT_YET_ACTIVE":       "TEMPORAL",
    "ENVELOPE_EXPIRED":              "TEMPORAL",

    "REVOKED_EPOCH_ADVANCED":        "REVOCATION",
    "REVOKED_GRANULAR":              "REVOCATION",
    "REVOCATION_CHECK_FAILED_CLOSED": "REVOCATION",

    "RAIL_CONNECTION_FAILED":        "RAIL",
    "RAIL_PAYMENT_DECLINED":         "RAIL",
    "RAIL_SETTLEMENT_PENDING":       "RAIL",
    "RAIL_UNSUPPORTED":              "RAIL",
    "RAIL_RECIPIENT_INVALID":        "RAIL",

    "RATE_LIMIT_ISSUER_API":         "RATE_LIMIT",
    "RATE_LIMIT_ENVELOPE_CREATION":  "RATE_LIMIT",

    "AUTH_API_KEY_INVALID":          "AUTH",
    "AUTH_API_KEY_REVOKED":          "AUTH",
    "AUTH_INSUFFICIENT_SCOPE":       "AUTH",

    "INTERNAL_SCHEMA_INVALID":       "INTERNAL",
    "INTERNAL_UNEXPECTED":           "INTERNAL",

    "NOT_IMPLEMENTED":               "NOT_IMPL",
}

# ---------------------------------------------------------------------------
# Retryability table  (mirrors RETRIABLE_CODES in TS)
# ---------------------------------------------------------------------------

_RETRIABLE_CODES: frozenset[str] = frozenset([
    "RAIL_CONNECTION_FAILED",
    "RAIL_SETTLEMENT_PENDING",
    "RATE_LIMIT_ISSUER_API",
    "RATE_LIMIT_ENVELOPE_CREATION",
    "INTERNAL_UNEXPECTED",
])

# ---------------------------------------------------------------------------
# PQSafeError base class
# ---------------------------------------------------------------------------


class PQSafeError(Exception):
    """
    Structured error base class for all PQSafe AgentPay errors.

    All errors thrown by Sprint 2+ code (and progressively migrated from
    Sprint 1) are instances of ``PQSafeError`` or a subclass.

    Attributes
    ----------
    error_class : ErrorClass
        Broad category — use for routing and alerting.
    code : str
        Fine-grained stable error code — safe for programmatic matching.
    is_retriable : bool
        Whether the same call may succeed if retried.
    retry_after_ms : int | None
        Minimum wait before retry (ms). ``None`` if not retriable.
    human_reason : str
        Operator-readable explanation.
    context : dict
        Structured context for inspection.

    Examples
    --------
    >>> try:
    ...     raise PQSafeError(
    ...         code="ENVELOPE_EXPIRED",
    ...         human_reason="The spend envelope expired 3 minutes ago.",
    ...         context={"valid_until": 1712345678, "now": 1712345858},
    ...     )
    ... except PQSafeError as e:
    ...     print(e.error_class, e.is_retriable)
    TEMPORAL False
    """

    def __init__(
        self,
        *,
        code: str,
        human_reason: str,
        context: Optional[Dict[str, Any]] = None,
        retry_after_ms: Optional[int] = None,
        cause: Optional[BaseException] = None,
    ) -> None:
        if code not in _ERROR_CLASS_MAP:
            raise ValueError(f"Unknown PQSafeErrorCode: {code!r}")
        message = f"[{code}] {human_reason}"
        super().__init__(message)
        self.__cause__ = cause

        self.code: str = code
        self.error_class: ErrorClass = _ERROR_CLASS_MAP[code]
        self.is_retriable: bool = code in _RETRIABLE_CODES
        self.retry_after_ms: Optional[int] = retry_after_ms
        self.human_reason: str = human_reason
        self.context: Dict[str, Any] = context if context is not None else {}

    def to_dict(self) -> Dict[str, Any]:
        """
        Serialize to a JSON-safe dict (for API responses and structured logging).

        Mirrors TypeScript ``PQSafeError.toJSON()``.

        Returns
        -------
        dict
            All structured fields as a plain Python dict.
        """
        return {
            "error_class": self.error_class,
            "code": self.code,
            "is_retriable": self.is_retriable,
            "retry_after_ms": self.retry_after_ms,
            "human_reason": self.human_reason,
            "context": self.context,
        }

    def __repr__(self) -> str:
        return (
            f"{type(self).__name__}(code={self.code!r}, "
            f"error_class={self.error_class!r}, "
            f"is_retriable={self.is_retriable})"
        )


# ---------------------------------------------------------------------------
# Typed subclasses (one per error_class, mirrors TS)
# ---------------------------------------------------------------------------


class SignatureError(PQSafeError):
    """Thrown when ML-DSA signature verification fails. Never retriable."""

    def __init__(self, *, code: str, **kwargs: Any) -> None:
        if not code.startswith("SIGNATURE_"):
            raise ValueError(f"SignatureError requires a SIGNATURE_* code, got: {code!r}")
        super().__init__(code=code, **kwargs)


class PolicyError(PQSafeError):
    """Thrown when spend policy is violated. Never retriable without a new envelope."""

    def __init__(self, *, code: str, **kwargs: Any) -> None:
        if not code.startswith("POLICY_"):
            raise ValueError(f"PolicyError requires a POLICY_* code, got: {code!r}")
        super().__init__(code=code, **kwargs)


class TemporalError(PQSafeError):
    """Thrown when an envelope is outside its validity window."""

    def __init__(self, *, code: str, **kwargs: Any) -> None:
        if code not in ("ENVELOPE_NOT_YET_ACTIVE", "ENVELOPE_EXPIRED"):
            raise ValueError(
                f"TemporalError requires ENVELOPE_NOT_YET_ACTIVE or ENVELOPE_EXPIRED, "
                f"got: {code!r}"
            )
        super().__init__(code=code, **kwargs)


class RevocationError(PQSafeError):
    """Thrown when an envelope has been revoked via any layer. Never retriable."""

    def __init__(self, *, code: str, **kwargs: Any) -> None:
        if not (code.startswith("REVOKED_") or code == "REVOCATION_CHECK_FAILED_CLOSED"):
            raise ValueError(
                f"RevocationError requires a REVOKED_* or REVOCATION_CHECK_FAILED_CLOSED "
                f"code, got: {code!r}"
            )
        super().__init__(code=code, **kwargs)


class RailError(PQSafeError):
    """Thrown when the downstream payment rail fails. May be retriable."""

    def __init__(self, *, code: str, **kwargs: Any) -> None:
        if not code.startswith("RAIL_"):
            raise ValueError(f"RailError requires a RAIL_* code, got: {code!r}")
        super().__init__(code=code, **kwargs)


class RateLimitError(PQSafeError):
    """Thrown when the hosted issuer API rate limit is hit. Retriable after retry_after_ms."""

    def __init__(self, *, code: str, **kwargs: Any) -> None:
        if not code.startswith("RATE_LIMIT_"):
            raise ValueError(f"RateLimitError requires a RATE_LIMIT_* code, got: {code!r}")
        super().__init__(code=code, **kwargs)


class AuthError(PQSafeError):
    """Thrown for authentication / API key issues. Not retriable without new credentials."""

    def __init__(self, *, code: str, **kwargs: Any) -> None:
        if not code.startswith("AUTH_"):
            raise ValueError(f"AuthError requires an AUTH_* code, got: {code!r}")
        super().__init__(code=code, **kwargs)


# ---------------------------------------------------------------------------
# Factory helpers (mirrors TS factory functions)
# ---------------------------------------------------------------------------


def signature_invalid_error(
    context: Optional[Dict[str, Any]] = None,
) -> SignatureError:
    """Create a SignatureError for failed ML-DSA-65 verification."""
    return SignatureError(
        code="SIGNATURE_INVALID",
        human_reason=(
            "ML-DSA-65 signature verification failed. "
            "The envelope has been tampered with or signed by a different key."
        ),
        context=context,
    )


def recipient_not_allowed_error(
    recipient: str,
    allowed: list[str],
) -> PolicyError:
    """Create a PolicyError for a recipient not in the allowlist."""
    return PolicyError(
        code="POLICY_RECIPIENT_NOT_ALLOWED",
        human_reason=f'Recipient "{recipient}" is not in the envelope allowlist.',
        context={"recipient": recipient, "allowedRecipients": allowed},
    )


def amount_exceeds_ceiling_error(
    requested: float,
    ceiling: float,
    currency: str,
) -> PolicyError:
    """Create a PolicyError for amount exceeding the envelope ceiling."""
    return PolicyError(
        code="POLICY_AMOUNT_EXCEEDS_CEILING",
        human_reason=(
            f"Requested amount {requested} {currency} exceeds "
            f"envelope maxAmount {ceiling} {currency}."
        ),
        context={"requested": requested, "ceiling": ceiling, "currency": currency},
    )


def envelope_expired_error(valid_until: int, now: int) -> TemporalError:
    """Create a TemporalError for an expired envelope."""
    expired_seconds_ago = now - valid_until
    return TemporalError(
        code="ENVELOPE_EXPIRED",
        human_reason=(
            f"Envelope expired {expired_seconds_ago} seconds ago. "
            "Issue a new envelope."
        ),
        context={
            "validUntil": valid_until,
            "now": now,
            "expiredSecondsAgo": expired_seconds_ago,
        },
    )


def envelope_not_yet_active_error(valid_from: int, now: int) -> TemporalError:
    """Create a TemporalError for an envelope not yet active."""
    activates_in = valid_from - now
    return TemporalError(
        code="ENVELOPE_NOT_YET_ACTIVE",
        human_reason=f"Envelope activates in {activates_in} seconds.",
        context={
            "validFrom": valid_from,
            "now": now,
            "activatesInSeconds": activates_in,
        },
    )
