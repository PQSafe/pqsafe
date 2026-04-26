"""
PQSafe AgentPay — Structured error hierarchy test suite.

Mirrors ``sprint2_errors.test.ts`` test-for-test (27 tests), covering:

  - Base class: isinstance, name, message, error_class mapping
  - Retryability: SIGNATURE, POLICY, REVOCATION never retriable;
    RAIL_CONNECTION_FAILED, RATE_LIMIT_* retriable
  - context defaults, structured data
  - to_dict() serialization
  - Typed subclasses: SignatureError, PolicyError, TemporalError,
    RevocationError, RailError, RateLimitError, AuthError
  - Factory helpers: signature_invalid_error, recipient_not_allowed_error,
    amount_exceeds_ceiling_error, envelope_expired_error,
    envelope_not_yet_active_error
  - cause chain preservation
"""

from __future__ import annotations

import pytest

from pqsafe.errors import (
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

# ---------------------------------------------------------------------------
# Base class
# ---------------------------------------------------------------------------


def test_pqsafe_error_is_isinstance_exception():
    err = PQSafeError(code="INTERNAL_UNEXPECTED", human_reason="Something went wrong")
    assert isinstance(err, Exception)
    assert isinstance(err, PQSafeError)


def test_pqsafe_error_name_attribute():
    err = PQSafeError(code="INTERNAL_UNEXPECTED", human_reason="test")
    # Python exceptions don't have a .name attribute by default — we access
    # the class name instead. But we mirror the TS behaviour by checking __class__
    assert type(err).__name__ == "PQSafeError"


def test_pqsafe_error_message_includes_code_and_reason():
    err = PQSafeError(
        code="SIGNATURE_INVALID",
        human_reason="tampered envelope",
    )
    assert "SIGNATURE_INVALID" in str(err), "message should include code"
    assert "tampered envelope" in str(err), "message should include human_reason"


def test_pqsafe_error_maps_code_to_correct_error_class():
    cases = [
        ("SIGNATURE_INVALID",            "SIGNATURE"),
        ("POLICY_RECIPIENT_NOT_ALLOWED", "POLICY"),
        ("ENVELOPE_EXPIRED",             "TEMPORAL"),
        ("REVOKED_EPOCH_ADVANCED",       "REVOCATION"),
        ("RAIL_CONNECTION_FAILED",       "RAIL"),
        ("RATE_LIMIT_ISSUER_API",        "RATE_LIMIT"),
        ("AUTH_API_KEY_INVALID",         "AUTH"),
        ("INTERNAL_UNEXPECTED",          "INTERNAL"),
        ("NOT_IMPLEMENTED",              "NOT_IMPL"),
    ]
    for code, expected_class in cases:
        err = PQSafeError(code=code, human_reason="test")
        assert err.error_class == expected_class, (
            f"{code} → expected {expected_class}, got {err.error_class}"
        )


def test_signature_errors_are_never_retriable():
    err = PQSafeError(code="SIGNATURE_INVALID", human_reason="test")
    assert err.is_retriable is False, "signature errors must not be retriable"


def test_policy_errors_are_never_retriable():
    err = PQSafeError(code="POLICY_AMOUNT_EXCEEDS_CEILING", human_reason="test")
    assert err.is_retriable is False, "policy errors must not be retriable"


def test_revocation_errors_are_never_retriable():
    err = PQSafeError(code="REVOKED_EPOCH_ADVANCED", human_reason="test")
    assert err.is_retriable is False, "revocation errors must not be retriable"


def test_rail_connection_failed_is_retriable():
    err = PQSafeError(code="RAIL_CONNECTION_FAILED", human_reason="test")
    assert err.is_retriable is True, "RAIL_CONNECTION_FAILED should be retriable"


def test_rate_limit_issuer_api_is_retriable_with_retry_after_ms():
    err = PQSafeError(
        code="RATE_LIMIT_ISSUER_API",
        human_reason="Too many requests",
        retry_after_ms=5000,
    )
    assert err.is_retriable is True, "rate limit should be retriable"
    assert err.retry_after_ms == 5000, "retry_after_ms should be 5000"


def test_auth_errors_are_not_retriable():
    err = PQSafeError(code="AUTH_API_KEY_INVALID", human_reason="bad key")
    assert err.is_retriable is False, "auth errors must not be retriable"


def test_context_defaults_to_empty_dict():
    err = PQSafeError(code="INTERNAL_UNEXPECTED", human_reason="test")
    assert isinstance(err.context, dict)
    assert len(err.context) == 0, "context should default to {}"


def test_context_carries_structured_data():
    err = PQSafeError(
        code="POLICY_AMOUNT_EXCEEDS_CEILING",
        human_reason="test",
        context={"requested": 250, "ceiling": 200, "currency": "USD"},
    )
    assert err.context["requested"] == 250
    assert err.context["currency"] == "USD"


def test_to_dict_returns_all_structured_fields():
    err = PQSafeError(
        code="SIGNATURE_INVALID",
        human_reason="tampered",
        context={"envelopeId": "abc"},
    )
    d = err.to_dict()
    assert d["error_class"] == "SIGNATURE"
    assert d["code"] == "SIGNATURE_INVALID"
    assert d["is_retriable"] is False
    assert d["human_reason"] == "tampered"
    assert d["context"]["envelopeId"] == "abc"


# ---------------------------------------------------------------------------
# Typed subclasses
# ---------------------------------------------------------------------------


def test_signature_error_isinstance():
    err = SignatureError(code="SIGNATURE_INVALID", human_reason="test")
    assert isinstance(err, PQSafeError)
    assert isinstance(err, SignatureError)
    assert type(err).__name__ == "SignatureError"


def test_policy_error_isinstance():
    err = PolicyError(code="POLICY_RECIPIENT_NOT_ALLOWED", human_reason="test")
    assert isinstance(err, PQSafeError)
    assert isinstance(err, PolicyError)
    assert type(err).__name__ == "PolicyError"


def test_temporal_error_isinstance():
    err = TemporalError(code="ENVELOPE_EXPIRED", human_reason="test")
    assert isinstance(err, PQSafeError)
    assert isinstance(err, TemporalError)


def test_revocation_error_isinstance():
    err = RevocationError(code="REVOKED_EPOCH_ADVANCED", human_reason="test")
    assert isinstance(err, PQSafeError)
    assert isinstance(err, RevocationError)


def test_rail_error_isinstance():
    err = RailError(code="RAIL_PAYMENT_DECLINED", human_reason="test")
    assert isinstance(err, PQSafeError)
    assert isinstance(err, RailError)


def test_rate_limit_error_isinstance():
    err = RateLimitError(code="RATE_LIMIT_ISSUER_API", human_reason="test")
    assert isinstance(err, PQSafeError)
    assert isinstance(err, RateLimitError)


def test_auth_error_isinstance():
    err = AuthError(code="AUTH_API_KEY_INVALID", human_reason="test")
    assert isinstance(err, PQSafeError)
    assert isinstance(err, AuthError)


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------


def test_signature_invalid_error_produces_correct_code():
    err = signature_invalid_error(context={"envelopeId": "0xabc"})
    assert err.code == "SIGNATURE_INVALID"
    assert err.error_class == "SIGNATURE"
    assert err.is_retriable is False
    assert err.context["envelopeId"] == "0xabc"


def test_recipient_not_allowed_error_carries_context():
    err = recipient_not_allowed_error("ATTACKER", ["GOOD_IBAN"])
    assert err.code == "POLICY_RECIPIENT_NOT_ALLOWED"
    assert err.context["recipient"] == "ATTACKER"
    assert isinstance(err.context["allowedRecipients"], list)


def test_amount_exceeds_ceiling_error_carries_context():
    err = amount_exceeds_ceiling_error(250, 200, "USD")
    assert err.code == "POLICY_AMOUNT_EXCEEDS_CEILING"
    assert err.context["requested"] == 250
    assert err.context["ceiling"] == 200
    assert err.context["currency"] == "USD"


def test_envelope_expired_error_carries_context():
    valid_until = 1_700_000_000
    now = 1_700_003_600
    err = envelope_expired_error(valid_until, now)
    assert err.code == "ENVELOPE_EXPIRED"
    assert err.context["expiredSecondsAgo"] == 3600


def test_envelope_not_yet_active_error_carries_context():
    valid_from = 1_700_003_600
    now = 1_700_000_000
    err = envelope_not_yet_active_error(valid_from, now)
    assert err.code == "ENVELOPE_NOT_YET_ACTIVE"
    assert err.context["activatesInSeconds"] == 3600


def test_cause_chain_is_preserved():
    root = ValueError("root cause")
    err = PQSafeError(
        code="INTERNAL_UNEXPECTED",
        human_reason="wrapper",
        cause=root,
    )
    assert err.__cause__ is root, "cause should be preserved"
