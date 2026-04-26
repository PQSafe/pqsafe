"""
PQSafe AgentPay — Sprint 2 policy + revocation + issuer test suite.

Covers:
  - SpendPolicy validation (valid + invalid modes)
  - effective_policy fallback to default
  - assert_policy_consistency cross-field check
  - Revocation stubs raise NotImplementedError
  - Issuer stubs raise NotImplementedError
  - SpendPolicyMode enum values
  - DEFAULT_SPEND_POLICY constant
"""

from __future__ import annotations

import pytest

from pqsafe.sprint2.policy import (
    CumulativeCapPolicy,
    DEFAULT_SPEND_POLICY,
    PerTxCapPolicy,
    SingleUsePolicy,
    SpendPolicyMode,
    assert_policy_consistency,
    effective_policy,
    validate_spend_policy,
)
import asyncio

from pqsafe.sprint2.revocation import (
    RevocationCheckRequest,
    RevocationServiceConfig,
    advance_epoch,
    get_epoch,
    is_revoked,
    revoke,
)
from pqsafe.sprint2.issuer import (
    MULTISIG_THRESHOLD_USD,
    SPEND_KEY_ROTATION_INTERVAL_SEC,
    create_agent_subkey,
    create_issuer_hierarchy,
    rotate_spend_key,
)


def _run(coro):
    """Helper to run an async coroutine synchronously in tests."""
    return asyncio.get_event_loop().run_until_complete(coro)

# ---------------------------------------------------------------------------
# SpendPolicyMode enum
# ---------------------------------------------------------------------------


def test_spend_policy_mode_values():
    assert SpendPolicyMode.SINGLE_USE.value == "single_use"
    assert SpendPolicyMode.PER_TX_CAP.value == "per_tx_cap"
    assert SpendPolicyMode.CUMULATIVE_CAP.value == "cumulative_cap"


# ---------------------------------------------------------------------------
# SingleUsePolicy
# ---------------------------------------------------------------------------


def test_single_use_policy_default_mode():
    p = SingleUsePolicy()
    assert p.mode == "single_use"


def test_single_use_policy_from_dict():
    p = validate_spend_policy({"mode": "single_use"})
    assert isinstance(p, SingleUsePolicy)
    assert p.mode == "single_use"


# ---------------------------------------------------------------------------
# PerTxCapPolicy
# ---------------------------------------------------------------------------


def test_per_tx_cap_policy_valid():
    p = validate_spend_policy({"mode": "per_tx_cap", "perTxLimit": 50.0})
    assert isinstance(p, PerTxCapPolicy)
    assert p.per_tx_limit == 50.0


def test_per_tx_cap_policy_zero_limit_raises():
    with pytest.raises(Exception):
        PerTxCapPolicy(mode="per_tx_cap", perTxLimit=0)


def test_per_tx_cap_policy_negative_limit_raises():
    with pytest.raises(Exception):
        PerTxCapPolicy(mode="per_tx_cap", perTxLimit=-5.0)


# ---------------------------------------------------------------------------
# CumulativeCapPolicy
# ---------------------------------------------------------------------------


def test_cumulative_cap_policy_no_reset_window():
    p = validate_spend_policy({"mode": "cumulative_cap"})
    assert isinstance(p, CumulativeCapPolicy)
    assert p.reset_window_seconds is None


def test_cumulative_cap_policy_with_reset_window():
    p = validate_spend_policy({"mode": "cumulative_cap", "resetWindowSeconds": 604800})
    assert isinstance(p, CumulativeCapPolicy)
    assert p.reset_window_seconds == 604800  # 7 days in seconds


# ---------------------------------------------------------------------------
# validate_spend_policy
# ---------------------------------------------------------------------------


def test_validate_unknown_mode_raises():
    with pytest.raises(ValueError, match="unrecognized mode"):
        validate_spend_policy({"mode": "unlimited"})


def test_validate_non_dict_raises():
    with pytest.raises(ValueError, match="expected dict"):
        validate_spend_policy("single_use")


def test_validate_passthrough_for_policy_instance():
    policy = SingleUsePolicy()
    result = validate_spend_policy(policy)
    assert result is policy


# ---------------------------------------------------------------------------
# DEFAULT_SPEND_POLICY
# ---------------------------------------------------------------------------


def test_default_spend_policy_is_single_use():
    assert isinstance(DEFAULT_SPEND_POLICY, SingleUsePolicy)
    assert DEFAULT_SPEND_POLICY.mode == "single_use"


# ---------------------------------------------------------------------------
# effective_policy
# ---------------------------------------------------------------------------


def test_effective_policy_returns_default_when_absent():
    result = effective_policy({})
    assert isinstance(result, SingleUsePolicy)
    assert result.mode == "single_use"


def test_effective_policy_returns_policy_when_present():
    policy = PerTxCapPolicy(mode="per_tx_cap", perTxLimit=25.0)
    result = effective_policy({"spend_policy": policy})
    assert isinstance(result, PerTxCapPolicy)
    assert result.per_tx_limit == 25.0


def test_effective_policy_accepts_camel_case_key():
    policy = CumulativeCapPolicy(mode="cumulative_cap")
    result = effective_policy({"spendPolicy": policy})
    assert isinstance(result, CumulativeCapPolicy)


# ---------------------------------------------------------------------------
# assert_policy_consistency
# ---------------------------------------------------------------------------


def test_assert_policy_consistency_per_tx_within_limit():
    policy = PerTxCapPolicy(mode="per_tx_cap", perTxLimit=50.0)
    assert_policy_consistency(policy, max_amount=100.0)  # should not raise


def test_assert_policy_consistency_per_tx_equals_max():
    policy = PerTxCapPolicy(mode="per_tx_cap", perTxLimit=100.0)
    assert_policy_consistency(policy, max_amount=100.0)  # equal is valid


def test_assert_policy_consistency_per_tx_exceeds_max():
    policy = PerTxCapPolicy(mode="per_tx_cap", perTxLimit=150.0)
    with pytest.raises(ValueError, match="per_tx_limit"):
        assert_policy_consistency(policy, max_amount=100.0)


def test_assert_policy_consistency_single_use_always_valid():
    policy = SingleUsePolicy()
    assert_policy_consistency(policy, max_amount=0.01)  # no constraint — should not raise


def test_assert_policy_consistency_cumulative_cap_always_valid():
    policy = CumulativeCapPolicy(mode="cumulative_cap", resetWindowSeconds=3600)
    assert_policy_consistency(policy, max_amount=10.0)  # no per_tx constraint


# ---------------------------------------------------------------------------
# Revocation stubs — must raise NotImplementedError
# ---------------------------------------------------------------------------


def test_is_revoked_raises_not_implemented():
    req = RevocationCheckRequest(
        issuerAddress="pq1" + "a" * 40,
        envelopeId="abc123",
        envelopeEpoch=0,
        requestedAmount=50.0,
        currency="USD",
    )
    cfg = RevocationServiceConfig(
        serviceUrl="https://api.pqsafe.xyz",
        apiKey="pq_test_key",
    )
    with pytest.raises(NotImplementedError, match="Sprint 2"):
        _run(is_revoked(req, cfg))


def test_revoke_raises_not_implemented():
    cfg = RevocationServiceConfig(
        serviceUrl="https://api.pqsafe.xyz",
        apiKey="pq_test_key",
    )
    with pytest.raises(NotImplementedError, match="Sprint 2"):
        _run(revoke("env_id_123", "test revocation", cfg))


def test_advance_epoch_raises_not_implemented():
    cfg = RevocationServiceConfig(
        serviceUrl="https://api.pqsafe.xyz",
        apiKey="pq_test_key",
    )
    with pytest.raises(NotImplementedError, match="Sprint 2"):
        _run(advance_epoch("pq1" + "a" * 40, cfg))


def test_get_epoch_raises_not_implemented():
    cfg = RevocationServiceConfig(
        serviceUrl="https://api.pqsafe.xyz",
        apiKey="pq_test_key",
    )
    with pytest.raises(NotImplementedError, match="Sprint 2"):
        _run(get_epoch("pq1" + "a" * 40, cfg))


# ---------------------------------------------------------------------------
# Issuer stubs — must raise NotImplementedError
# ---------------------------------------------------------------------------


def test_create_issuer_hierarchy_raises_not_implemented():
    with pytest.raises(NotImplementedError, match="Sprint 2"):
        _run(create_issuer_hierarchy(
            hsm_provider="software-dev-only",
            organization_name="PQSafe Test",
            api_key="pq_test_key",
            service_url="https://api.pqsafe.xyz",
        ))


def test_rotate_spend_key_raises_not_implemented():
    with pytest.raises(NotImplementedError, match="Sprint 2"):
        _run(rotate_spend_key(
            "pq1" + "a" * 40,
            service_url="https://api.pqsafe.xyz",
            api_key="pq_test_key",
        ))


def test_create_agent_subkey_raises_not_implemented():
    with pytest.raises(NotImplementedError, match="Sprint 2"):
        _run(create_agent_subkey(
            "pq1" + "a" * 40,
            agent_id="my-agent",
            agent_max_amount=100.0,
            service_url="https://api.pqsafe.xyz",
            api_key="pq_test_key",
        ))


# ---------------------------------------------------------------------------
# Issuer constants
# ---------------------------------------------------------------------------


def test_multisig_threshold_is_1000():
    assert MULTISIG_THRESHOLD_USD == 1_000.0


def test_spend_key_rotation_interval_is_90_days():
    assert SPEND_KEY_ROTATION_INTERVAL_SEC == 90 * 24 * 60 * 60
