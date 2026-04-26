"""
PQSafe AgentPay — AP2 + ACP adapter test suite (Python).

18+ test cases covering:
  - AP2 IntentMandate → SpendEnvelope and back
  - AP2 CartMandate → SpendEnvelope and back
  - AP2 PaymentMandate → SpendEnvelope and back
  - AP2 PQ verify (sign canonical bytes, verify passes, tamper fails)
  - ACP SPT → SpendEnvelope (cents conversion, agentId override, guards)
  - ACP SpendEnvelope → SPT params round-trip

Mirrors TypeScript SDK ``tests/adapters.test.ts``.
"""

from __future__ import annotations

import hashlib
import time
import warnings
from datetime import datetime, timedelta, timezone

import pytest

from pqsafe.adapters.ap2 import (
    CartMandate,
    IntentMandate,
    PaymentItem,
    PaymentMandate,
    PaymentMethodData,
    ap2_mandate_to_spend_envelope,
    spend_envelope_to_ap2_mandate,
    verify_ap2_with_pq_wrapper,
)
from pqsafe.adapters.acp import (
    SharedPaymentToken,
    SharedPaymentTokenUsageLimits,
    acp_token_to_spend_envelope,
    spend_envelope_to_acp_token,
)
from pqsafe.crypto import generate_keypair, sign_bytes
from pqsafe.canonical import canonical_json_bytes
from pqsafe.types import SpendEnvelope

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_NOW_ISO = (datetime.now(tz=timezone.utc) + timedelta(hours=1)).strftime(
    "%Y-%m-%dT%H:%M:%S.000Z"
)

_ISSUER = "pq1" + "a" * 40


def _make_intent_mandate(agent_id: str = "agent-001", issuer: str = _ISSUER) -> IntentMandate:
    return IntentMandate(
        type="intent",
        mandateId="mandate-intent-001",
        merchantId="merchant-xyz",
        description="Buy something nice",
        maxAmount=150.0,
        currency="USD",
        expiresAt=_NOW_ISO,
        agentId=agent_id,
        issuerAddress=issuer,
    )


def _make_cart_mandate(agent_id: str = "agent-002", issuer: str = _ISSUER) -> CartMandate:
    return CartMandate(
        type="cart",
        mandateId="mandate-cart-001",
        merchantId="merchant-xyz",
        items=[PaymentItem(label="Widget", amount=75.0, currency="USD", quantity=2)],
        subtotal=150.0,
        total=165.0,
        currency="USD",
        expiresAt=_NOW_ISO,
        agentId=agent_id,
        issuerAddress=issuer,
    )


def _make_payment_mandate(agent_id: str = "agent-003", issuer: str = _ISSUER) -> PaymentMandate:
    return PaymentMandate(
        type="payment",
        mandateId="mandate-pay-001",
        merchantId="merchant-xyz",
        amount=165.0,
        currency="USD",
        paymentMethod=PaymentMethodData(supportedMethods="stripe"),
        recipientAddress="acct_1PXqBBGJhmH2PkST",
        expiresAt=_NOW_ISO,
        agentId=agent_id,
        issuerAddress=issuer,
    )


def _make_active_spt() -> SharedPaymentToken:
    return SharedPaymentToken(
        id="spt_1PXqBBGJhmH2PkSTDemoToken123",
        object="shared_payment_token",
        paymentMethod="pm_1PXqBBGJhmH2PkSTDemoPayment",
        customer="cus_1234567890",
        agentId="my-agent-v1",
        active=True,
        amountUsed=0,
        currency="USD",
        created=1_700_000_000,
        lastUsed=None,
        usageLimits=SharedPaymentTokenUsageLimits(
            maxAmountPerTransaction=10000,
            allowedMerchants=["acct_1PXqBBGJhmH2PkST"],
            expiresAt="2026-12-31T23:59:59Z",
            currency="USD",
        ),
    )


# ---------------------------------------------------------------------------
# AP2 mandate → SpendEnvelope round-trips
# ---------------------------------------------------------------------------


class TestAP2MandateToSpendEnvelope:
    def test_intent_mandate_preserves_amount_currency_agent(self):
        mandate = _make_intent_mandate("agent-001")
        env = ap2_mandate_to_spend_envelope(mandate, _ISSUER, ttl_seconds=3600)
        assert env.max_amount == 150.0
        assert env.currency == "USD"
        assert env.agent == "agent-001"
        assert env.issuer == _ISSUER
        assert env.allowed_recipients[0] == "merchant-xyz"
        assert len(env.nonce) == 32
        assert all(c in "0123456789abcdef" for c in env.nonce)
        assert env.version == 1

    def test_cart_mandate_uses_total_as_max_amount(self):
        mandate = _make_cart_mandate("agent-002")
        env = ap2_mandate_to_spend_envelope(mandate, _ISSUER, ttl_seconds=3600)
        assert env.max_amount == 165.0
        assert env.currency == "USD"
        assert env.agent == "agent-002"
        assert env.allowed_recipients[0] == "merchant-xyz"

    def test_payment_mandate_uses_amount_and_recipient(self):
        mandate = _make_payment_mandate("agent-003")
        env = ap2_mandate_to_spend_envelope(mandate, _ISSUER, ttl_seconds=3600)
        assert env.max_amount == 165.0
        assert env.allowed_recipients[0] == "acct_1PXqBBGJhmH2PkST"

    def test_ttl_seconds_overrides_expires_at(self):
        mandate = _make_intent_mandate()
        before = int(time.time())
        env = ap2_mandate_to_spend_envelope(mandate, _ISSUER, ttl_seconds=7200)
        after = int(time.time())
        assert before + 7200 <= env.valid_until <= after + 7200

    def test_currency_normalized_to_uppercase(self):
        mandate = _make_intent_mandate()
        # Force lowercase currency
        mandate_dict = mandate.model_dump(by_alias=True)
        mandate_dict["currency"] = "usd"
        m2 = IntentMandate(**mandate_dict)
        env = ap2_mandate_to_spend_envelope(m2, _ISSUER, ttl_seconds=3600)
        assert env.currency == "USD"

    def test_nonce_is_deterministic_from_mandate_id(self):
        mandate = _make_intent_mandate()
        env1 = ap2_mandate_to_spend_envelope(mandate, _ISSUER, ttl_seconds=3600)
        env2 = ap2_mandate_to_spend_envelope(mandate, _ISSUER, ttl_seconds=3600)
        # Same mandateId → same nonce
        assert env1.nonce == env2.nonce


class TestSpendEnvelopeToAP2Mandate:
    def _make_env(self, agent: str = "agent-x", max_amount: float = 100.0) -> SpendEnvelope:
        now = int(time.time())
        # Use a nonce of exactly 32 hex chars (sha256 of "mandate-001")[:16].hex()
        nonce = hashlib.sha256(b"mandate-001").hexdigest()[:32]
        return SpendEnvelope(
            version=1,
            issuer=_ISSUER,
            agent=agent,
            max_amount=max_amount,
            currency="USD",
            allowed_recipients=["acct_demo"],
            valid_from=now,
            valid_until=now + 3600,
            nonce=nonce,
        )

    def test_envelope_to_intent_mandate_fields(self):
        env = self._make_env("agent-004")
        m = spend_envelope_to_ap2_mandate(env, "intent")
        assert isinstance(m, IntentMandate)
        assert m.type == "intent"
        assert m.max_amount == env.max_amount
        assert m.currency == env.currency
        assert m.agent_id == env.agent
        assert m.issuer_address == env.issuer
        assert len(m.description) > 0
        assert m.expires_at  # non-empty ISO string

    def test_envelope_to_cart_mandate_fields(self):
        env = self._make_env("agent-005")
        m = spend_envelope_to_ap2_mandate(env, "cart")
        assert isinstance(m, CartMandate)
        assert m.type == "cart"
        assert m.total == env.max_amount
        assert m.currency == env.currency
        assert len(m.items) > 0
        assert m.items[0].currency == env.currency

    def test_envelope_to_payment_mandate_fields(self):
        env = self._make_env("agent-006")
        m = spend_envelope_to_ap2_mandate(env, "payment")
        assert isinstance(m, PaymentMandate)
        assert m.type == "payment"
        assert m.amount == env.max_amount
        assert m.recipient_address == env.allowed_recipients[0]
        assert m.currency == env.currency

    def test_payment_mandate_from_empty_recipients_raises(self):
        now = int(time.time())
        nonce = hashlib.sha256(b"test").hexdigest()[:32]
        env = SpendEnvelope(
            version=1,
            issuer=_ISSUER,
            agent="agent-x",
            max_amount=100.0,
            currency="USD",
            allowed_recipients=["placeholder"],
            valid_from=now,
            valid_until=now + 3600,
            nonce=nonce,
        )
        # Manually clear recipients (bypass Pydantic validation by modifying model)
        object.__setattr__(env, "allowed_recipients", [])
        with pytest.raises(ValueError, match="allowed_recipients is empty"):
            spend_envelope_to_ap2_mandate(env, "payment")


# ---------------------------------------------------------------------------
# AP2 PQ verify
# ---------------------------------------------------------------------------


class TestVerifyAP2WithPQWrapper:
    def test_sign_and_verify_passes(self):
        kp = generate_keypair()
        mandate = _make_payment_mandate("agent-007")
        mandate_dict = mandate.model_dump(by_alias=True, exclude_none=True)
        canon_bytes = canonical_json_bytes(mandate_dict)
        sig = sign_bytes(canon_bytes, kp.secret_key)
        result = verify_ap2_with_pq_wrapper(mandate, sig, kp.public_key)
        assert result is True

    def test_tampered_signature_fails(self):
        kp = generate_keypair()
        mandate = _make_intent_mandate("agent-008")
        mandate_dict = mandate.model_dump(by_alias=True, exclude_none=True)
        canon_bytes = canonical_json_bytes(mandate_dict)
        sig = bytearray(sign_bytes(canon_bytes, kp.secret_key))
        sig[500] ^= 0xFF
        with pytest.raises(ValueError, match="verification failed"):
            verify_ap2_with_pq_wrapper(mandate, bytes(sig), kp.public_key)

    def test_wrong_public_key_fails(self):
        signer_kp = generate_keypair()
        wrong_kp = generate_keypair()
        mandate = _make_cart_mandate("agent-009")
        mandate_dict = mandate.model_dump(by_alias=True, exclude_none=True)
        canon_bytes = canonical_json_bytes(mandate_dict)
        sig = sign_bytes(canon_bytes, signer_kp.secret_key)
        with pytest.raises(ValueError, match="verification failed"):
            verify_ap2_with_pq_wrapper(mandate, sig, wrong_kp.public_key)

    def test_wrong_signature_size_raises(self):
        kp = generate_keypair()
        mandate = _make_intent_mandate("agent-010")
        short_sig = bytes(100)
        with pytest.raises(ValueError, match="invalid ML-DSA-65 signature length"):
            verify_ap2_with_pq_wrapper(mandate, short_sig, kp.public_key)

    def test_wrong_public_key_size_raises(self):
        kp = generate_keypair()
        mandate = _make_intent_mandate("agent-011")
        mandate_dict = mandate.model_dump(by_alias=True, exclude_none=True)
        canon_bytes = canonical_json_bytes(mandate_dict)
        sig = sign_bytes(canon_bytes, kp.secret_key)
        with pytest.raises(ValueError, match="invalid ML-DSA-65 public key length"):
            verify_ap2_with_pq_wrapper(mandate, sig, bytes(32))


# ---------------------------------------------------------------------------
# ACP SPT → SpendEnvelope
# ---------------------------------------------------------------------------


class TestACPTokenToSpendEnvelope:
    def test_cents_conversion_usd(self):
        spt = _make_active_spt()
        env = acp_token_to_spend_envelope(spt, _ISSUER)
        assert env.max_amount == 100.0  # 10000 cents / 100
        assert env.currency == "USD"
        assert env.agent == spt.agent_id
        assert env.issuer == _ISSUER
        assert env.allowed_recipients[0] == "acct_1PXqBBGJhmH2PkST"
        assert env.rail == "stripe"
        assert len(env.nonce) == 32

    def test_agent_id_override(self):
        spt = _make_active_spt()
        env = acp_token_to_spend_envelope(spt, _ISSUER, agent_id="override-agent-v2")
        assert env.agent == "override-agent-v2"

    def test_deactivated_spt_raises(self):
        spt_data = _make_active_spt().model_dump(by_alias=True)
        spt_data["active"] = False
        spt = SharedPaymentToken(**spt_data)
        with pytest.raises(ValueError, match="deactivated"):
            acp_token_to_spend_envelope(spt, _ISSUER)

    def test_missing_allowed_merchants_raises(self):
        spt_data = _make_active_spt().model_dump(by_alias=True)
        spt_data["usageLimits"] = {
            "maxAmountPerTransaction": 10000,
            "expiresAt": "2026-12-31T23:59:59Z",
        }
        spt = SharedPaymentToken(**spt_data)
        with pytest.raises(ValueError, match="allowedMerchants"):
            acp_token_to_spend_envelope(spt, _ISSUER)

    def test_empty_allowed_merchants_raises(self):
        spt_data = _make_active_spt().model_dump(by_alias=True)
        spt_data["usageLimits"]["allowedMerchants"] = []
        spt = SharedPaymentToken(**spt_data)
        with pytest.raises(ValueError, match="allowedMerchants"):
            acp_token_to_spend_envelope(spt, _ISSUER)

    def test_zero_decimal_currency_no_division(self):
        """JPY should NOT be divided by 100 — it is zero-decimal."""
        spt_data = _make_active_spt().model_dump(by_alias=True)
        spt_data["currency"] = "JPY"
        spt_data["usageLimits"]["currency"] = "JPY"
        spt_data["usageLimits"]["maxAmountPerTransaction"] = 10000
        spt = SharedPaymentToken(**spt_data)
        env = acp_token_to_spend_envelope(spt, _ISSUER)
        assert env.max_amount == 10000.0  # no division for JPY

    def test_fallback_to_total_amount_when_no_per_tx(self):
        spt_data = _make_active_spt().model_dump(by_alias=True)
        spt_data["usageLimits"]["maxAmountPerTransaction"] = None
        spt_data["usageLimits"]["maxTotalAmount"] = 50000
        spt = SharedPaymentToken(**spt_data)
        env = acp_token_to_spend_envelope(spt, _ISSUER)
        assert env.max_amount == 500.0  # 50000 / 100

    def test_no_expiry_defaults_to_one_year(self):
        spt_data = _make_active_spt().model_dump(by_alias=True)
        spt_data["usageLimits"]["expiresAt"] = None
        spt = SharedPaymentToken(**spt_data)
        env = acp_token_to_spend_envelope(spt, _ISSUER)
        expected_until = spt.created + 365 * 24 * 3600
        assert env.valid_until == expected_until


class TestSpendEnvelopeToACPToken:
    def test_round_trip_correct_cent_multiplier(self):
        spt = _make_active_spt()
        env = acp_token_to_spend_envelope(spt, _ISSUER)
        params = spend_envelope_to_acp_token(env, "pm_1PXqBBGJhmH2PkSTDemo")
        assert params.usage_limits is not None
        assert params.usage_limits.max_amount_per_transaction == 10000  # $100 → 10000 cents
        assert params.currency == "USD"
        assert params.agent_id == spt.agent_id
        assert params.usage_limits.allowed_merchants == ["acct_1PXqBBGJhmH2PkST"]
        assert params.payment_method == "pm_1PXqBBGJhmH2PkSTDemo"
        assert params.usage_limits.expires_at  # non-empty ISO string
        assert params.idempotency_key == env.nonce

    def test_multi_recipient_raises(self):
        spt_data = _make_active_spt().model_dump(by_alias=True)
        spt_data["usageLimits"]["allowedMerchants"] = ["acct_111", "acct_222"]
        spt = SharedPaymentToken(**spt_data)
        env = acp_token_to_spend_envelope(spt, _ISSUER)
        with pytest.raises(ValueError, match="single-merchant"):
            spend_envelope_to_acp_token(env, "pm_demo")

    def test_non_stripe_rail_warns(self):
        spt = _make_active_spt()
        env = acp_token_to_spend_envelope(spt, _ISSUER)
        now = int(time.time())
        nonce = hashlib.sha256(b"wise-test").hexdigest()[:32]
        wise_env = SpendEnvelope(
            version=1,
            issuer=_ISSUER,
            agent=env.agent,
            max_amount=env.max_amount,
            currency=env.currency,
            allowed_recipients=env.allowed_recipients,
            valid_from=now,
            valid_until=now + 3600,
            nonce=nonce,
            rail="wise",
        )
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            params = spend_envelope_to_acp_token(wise_env, "pm_demo")
            assert any("wise" in str(w.message) for w in caught)
        assert params.payment_method == "pm_demo"
