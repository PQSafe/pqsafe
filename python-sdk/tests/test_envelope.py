"""
Tests for PQSafe AgentPay Python SDK.

Covers:
  - Key generation
  - Envelope creation + validation
  - Sign -> verify roundtrip (ML-DSA-65 or Ed25519 fallback)
  - Tampered signature rejection
  - Temporal validity enforcement
  - pay() with dry_run=True
  - pay() with requests-mock (stubbed HTTP)
  - Recipient allowlist enforcement
  - Amount ceiling enforcement
"""

from __future__ import annotations

import json
import time
from unittest.mock import patch

import pytest
import requests_mock as req_mock_module

from pqsafe import (
    PaymentRequest,
    PaymentResult,
    SignedEnvelope,
    SpendEnvelope,
    active_backend,
    create_envelope,
    generate_keypair,
    pay,
    sign_envelope,
    verify_envelope,
)
from pqsafe.crypto import sign_bytes, verify_bytes

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

ISSUER = "pq1" + "a" * 40  # valid pq1 address
AGENT = "test-agent-v1"
RECIPIENT_1 = "GB29NWBK60161331926819"  # IBAN-style
RECIPIENT_2 = "38873dbc-abfa-4ab5-be25-050496d4a0c3"  # Airwallex UUID


@pytest.fixture(scope="module")
def keypair():
    return generate_keypair()


@pytest.fixture
def envelope():
    return create_envelope(
        issuer=ISSUER,
        agent=AGENT,
        max_amount=100.0,
        currency="USD",
        allowed_recipients=[RECIPIENT_1, RECIPIENT_2],
    )


@pytest.fixture
def signed(envelope, keypair):
    return sign_envelope(envelope, keypair)


# ---------------------------------------------------------------------------
# Crypto backend
# ---------------------------------------------------------------------------


def test_active_backend_is_set():
    backend = active_backend()
    assert isinstance(backend, str)
    assert len(backend) > 0


def test_backend_name_contains_algorithm():
    backend = active_backend()
    # Should mention either ml-dsa or ed25519
    assert "ml-dsa" in backend.lower() or "ed25519" in backend.lower()


# ---------------------------------------------------------------------------
# Key generation
# ---------------------------------------------------------------------------


def test_generate_keypair_returns_nonempty_keys(keypair):
    assert len(keypair.public_key) > 0
    assert len(keypair.secret_key) > 0


def test_keypair_hex_methods(keypair):
    pk_hex = keypair.public_key_hex()
    sk_hex = keypair.secret_key_hex()
    assert bytes.fromhex(pk_hex) == keypair.public_key
    assert bytes.fromhex(sk_hex) == keypair.secret_key


def test_two_keypairs_are_distinct():
    kp1 = generate_keypair()
    kp2 = generate_keypair()
    assert kp1.public_key != kp2.public_key
    assert kp1.secret_key != kp2.secret_key


# ---------------------------------------------------------------------------
# sign_bytes / verify_bytes
# ---------------------------------------------------------------------------


def test_sign_verify_roundtrip(keypair):
    msg = b"hello from PQSafe"
    sig = sign_bytes(msg, keypair.secret_key)
    assert verify_bytes(msg, sig, keypair.public_key) is True


def test_verify_wrong_message(keypair):
    msg = b"original message"
    sig = sign_bytes(msg, keypair.secret_key)
    assert verify_bytes(b"tampered message", sig, keypair.public_key) is False


def test_verify_wrong_key(keypair):
    msg = b"hello"
    sig = sign_bytes(msg, keypair.secret_key)
    other_kp = generate_keypair()
    assert verify_bytes(msg, sig, other_kp.public_key) is False


def test_verify_truncated_signature(keypair):
    msg = b"hello"
    sig = sign_bytes(msg, keypair.secret_key)
    assert verify_bytes(msg, sig[:10], keypair.public_key) is False


# ---------------------------------------------------------------------------
# Envelope creation
# ---------------------------------------------------------------------------


def test_create_envelope_returns_spend_envelope(envelope):
    assert isinstance(envelope, SpendEnvelope)


def test_create_envelope_fields(envelope):
    assert envelope.issuer == ISSUER
    assert envelope.agent == AGENT
    assert envelope.max_amount == 100.0
    assert envelope.currency == "USD"
    assert RECIPIENT_1 in envelope.allowed_recipients
    assert envelope.version == 1


def test_create_envelope_currency_uppercased():
    env = create_envelope(
        issuer=ISSUER,
        agent=AGENT,
        max_amount=50.0,
        currency="hkd",
        allowed_recipients=[RECIPIENT_1],
    )
    assert env.currency == "HKD"


def test_create_envelope_nonce_is_32_hex(envelope):
    assert len(envelope.nonce) == 32
    bytes.fromhex(envelope.nonce)  # must not raise


def test_create_envelope_temporal_window(envelope):
    now = int(time.time())
    assert envelope.valid_from <= now + 5  # starts soon
    assert envelope.valid_until > now  # expires in the future


def test_create_envelope_invalid_issuer():
    with pytest.raises(Exception):
        create_envelope(
            issuer="not-a-valid-issuer",
            agent=AGENT,
            max_amount=10.0,
            currency="USD",
            allowed_recipients=[RECIPIENT_1],
        )


def test_create_envelope_empty_recipients_fails():
    with pytest.raises(Exception):
        create_envelope(
            issuer=ISSUER,
            agent=AGENT,
            max_amount=10.0,
            currency="USD",
            allowed_recipients=[],
        )


def test_create_envelope_negative_amount_fails():
    with pytest.raises(Exception):
        create_envelope(
            issuer=ISSUER,
            agent=AGENT,
            max_amount=-1.0,
            currency="USD",
            allowed_recipients=[RECIPIENT_1],
        )


# ---------------------------------------------------------------------------
# Sign -> Verify roundtrip
# ---------------------------------------------------------------------------


def test_sign_envelope_returns_signed_envelope(signed):
    assert isinstance(signed, SignedEnvelope)


def test_signed_envelope_has_required_fields(signed):
    assert signed.envelope_json
    assert signed.signature
    assert signed.dsa_public_key


def test_signed_envelope_json_is_valid_json(signed):
    data = json.loads(signed.envelope_json)
    assert "issuer" in data
    assert "maxAmount" in data  # camelCase wire format


def test_verify_roundtrip(signed, keypair):
    verified = verify_envelope(signed, skip_temporal=True)
    assert isinstance(verified, SpendEnvelope)
    assert verified.issuer == ISSUER
    assert verified.agent == AGENT


def test_verify_with_explicit_public_key(signed, keypair):
    verified = verify_envelope(signed, keypair.public_key, skip_temporal=True)
    assert verified.max_amount == 100.0


def test_verify_tampered_signature_fails(signed):
    tampered = SignedEnvelope(
        envelope_json=signed.envelope_json,
        signature="00" * 100,  # garbage signature
        dsa_public_key=signed.dsa_public_key,
    )
    with pytest.raises(ValueError, match="signature verification failed"):
        verify_envelope(tampered, skip_temporal=True)


def test_verify_tampered_payload_fails(signed, keypair):
    # Modify the envelope_json after signing — signature should not match
    data = json.loads(signed.envelope_json)
    data["maxAmount"] = 999999.0
    tampered = SignedEnvelope(
        envelope_json=json.dumps(data),
        signature=signed.signature,
        dsa_public_key=signed.dsa_public_key,
    )
    with pytest.raises(ValueError, match="signature verification failed"):
        verify_envelope(tampered, skip_temporal=True)


def test_verify_wrong_public_key_fails(signed):
    other_kp = generate_keypair()
    with pytest.raises(ValueError, match="signature verification failed"):
        verify_envelope(signed, other_kp.public_key, skip_temporal=True)


# ---------------------------------------------------------------------------
# Temporal validity
# ---------------------------------------------------------------------------


def test_verify_expired_envelope_fails(keypair):
    # Build an envelope that expired 1 second ago by directly constructing the model
    import time as _time
    from pqsafe.types import SpendEnvelope as _SpendEnvelope

    now = int(_time.time())
    expired_env = _SpendEnvelope(
        issuer=ISSUER,
        agent=AGENT,
        max_amount=10.0,
        currency="USD",
        allowed_recipients=[RECIPIENT_1],
        valid_from=now - 7200,   # started 2h ago
        valid_until=now - 3600,  # expired 1h ago
        nonce="a" * 32,
    )
    signed = sign_envelope(expired_env, keypair)
    with pytest.raises(ValueError, match="expired"):
        verify_envelope(signed)


def test_verify_future_envelope_fails(keypair):
    env = create_envelope(
        issuer=ISSUER,
        agent=AGENT,
        max_amount=10.0,
        currency="USD",
        allowed_recipients=[RECIPIENT_1],
        starts_in_seconds=3600,  # starts 1h from now
    )
    signed = sign_envelope(env, keypair)
    with pytest.raises(ValueError, match="not yet active"):
        verify_envelope(signed)


# ---------------------------------------------------------------------------
# pay() — dry_run mode
# ---------------------------------------------------------------------------


def test_pay_dry_run(signed):
    result = pay(
        signed,
        PaymentRequest(recipient=RECIPIENT_1, amount=10.0),
        dry_run=True,
    )
    assert isinstance(result, PaymentResult)
    assert result.tx_id.startswith("awx_sbx_")
    assert result.status == "mock_confirmed"


def test_pay_dry_run_dict_request(signed):
    result = pay(
        signed,
        {"recipient": RECIPIENT_1, "amount": 5.0, "memo": "test"},
        dry_run=True,
    )
    assert result.tx_id.startswith("awx_sbx_")


def test_pay_dry_run_wrong_recipient_rejected(signed):
    with pytest.raises(ValueError, match="allowlist"):
        pay(
            signed,
            PaymentRequest(recipient="not-in-allowlist", amount=10.0),
            dry_run=True,
        )


def test_pay_dry_run_amount_exceeds_max(signed):
    with pytest.raises(ValueError, match="max_amount"):
        pay(
            signed,
            PaymentRequest(recipient=RECIPIENT_1, amount=999.0),
            dry_run=True,
        )


# ---------------------------------------------------------------------------
# pay() — stubbed HTTP via requests-mock
# ---------------------------------------------------------------------------


def test_pay_http_success(signed):
    fake_response = {
        "txId": "airwallex-tx-abc123",
        "status": "confirmed",
        "rail": "airwallex",
    }
    with req_mock_module.Mocker() as m:
        m.post("https://api.pqsafe.xyz/v1/pay", json=fake_response)
        result = pay(
            signed,
            PaymentRequest(recipient=RECIPIENT_1, amount=10.0),
        )
    assert result.tx_id == "airwallex-tx-abc123"
    assert result.status == "confirmed"
    assert result.rail == "airwallex"


def test_pay_http_sends_correct_wire_shape(signed):
    """Verify the POST body matches the wire format used by all PQSafe plugins."""
    captured: list = []
    fake_response = {"txId": "tx-1", "status": "confirmed", "rail": "wise"}

    with req_mock_module.Mocker() as m:
        m.post("https://api.pqsafe.xyz/v1/pay", json=fake_response)
        pay(signed, PaymentRequest(recipient=RECIPIENT_1, amount=7.5, memo="invoice 99"))
        captured.append(m.last_request)

    body = json.loads(captured[0].text)
    # Top-level keys
    assert "signedEnvelope" in body
    assert "request" in body
    # signedEnvelope shape
    se = body["signedEnvelope"]
    assert "envelopeJson" in se
    assert "signature" in se
    assert "dsaPublicKey" in se
    # request shape
    req = body["request"]
    assert req["recipient"] == RECIPIENT_1
    assert req["amount"] == 7.5
    assert req["memo"] == "invoice 99"


def test_pay_http_404_raises(signed):
    with req_mock_module.Mocker() as m:
        m.post("https://api.pqsafe.xyz/v1/pay", status_code=404, text="not found")
        with pytest.raises(Exception):  # requests.HTTPError
            pay(signed, PaymentRequest(recipient=RECIPIENT_1, amount=1.0))


def test_pay_custom_base_url(signed):
    fake_response = {"txId": "tx-custom", "status": "pending", "rail": "stripe"}
    with req_mock_module.Mocker() as m:
        m.post("https://sandbox.pqsafe.xyz/v1/pay", json=fake_response)
        result = pay(
            signed,
            PaymentRequest(recipient=RECIPIENT_1, amount=1.0),
            base_url="https://sandbox.pqsafe.xyz",
        )
    assert result.tx_id == "tx-custom"


# ---------------------------------------------------------------------------
# PaymentResult model
# ---------------------------------------------------------------------------


def test_payment_result_accepts_camel_case():
    r = PaymentResult(txId="tx-1", status="confirmed", rail="airwallex")
    assert r.tx_id == "tx-1"


def test_payment_result_accepts_snake_case():
    r = PaymentResult(tx_id="tx-2", status="pending", rail="wise")
    assert r.tx_id == "tx-2"


# ---------------------------------------------------------------------------
# USDC and crypto currency support
# ---------------------------------------------------------------------------


def test_create_envelope_with_usdc_currency(keypair):
    """USDC is 4 chars — must be accepted by the schema."""
    env = create_envelope(
        issuer=ISSUER,
        agent="usdc-agent",
        max_amount=500.0,
        currency="USDC",
        allowed_recipients=["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
        rail="usdc-base",
    )
    assert env.currency == "USDC"
    assert env.rail == "usdc-base"


def test_create_envelope_with_usdt_currency(keypair):
    env = create_envelope(
        issuer=ISSUER,
        agent="usdt-agent",
        max_amount=100.0,
        currency="USDT",
        allowed_recipients=["0xabcdef1234567890abcdef1234567890abcdef12"],
    )
    assert env.currency == "USDT"


# ---------------------------------------------------------------------------
# pay() — mock_mode parameter
# ---------------------------------------------------------------------------


def test_pay_mock_mode_generates_realistic_tx_id(keypair):
    env = create_envelope(
        issuer=ISSUER,
        agent="mock-test-agent",
        max_amount=200.0,
        currency="USD",
        allowed_recipients=[RECIPIENT_1],
    )
    signed_env = sign_envelope(env, keypair)
    result = pay(signed_env, PaymentRequest(recipient=RECIPIENT_1, amount=50.0), mock_mode=True)
    assert result.success if hasattr(result, 'success') else True
    assert result.tx_id.startswith("awx_sbx_")
    assert result.status == "mock_confirmed"
    assert result.rail == "airwallex"


def test_pay_mock_mode_wise_rail(keypair):
    env = create_envelope(
        issuer=ISSUER,
        agent="wise-mock-agent",
        max_amount=200.0,
        currency="GBP",
        allowed_recipients=[RECIPIENT_1],
        rail="wise",
    )
    signed_env = sign_envelope(env, keypair)
    result = pay(signed_env, PaymentRequest(recipient=RECIPIENT_1, amount=50.0), mock_mode=True)
    assert result.tx_id.startswith("wise_sbx_")
    assert result.rail == "wise"


def test_pay_mock_mode_usdc_base_rail(keypair):
    evm_address = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    env = create_envelope(
        issuer=ISSUER,
        agent="usdc-mock-agent",
        max_amount=500.0,
        currency="USDC",
        allowed_recipients=[evm_address],
        rail="usdc-base",
    )
    signed_env = sign_envelope(env, keypair)
    result = pay(signed_env, PaymentRequest(recipient=evm_address, amount=100.0), mock_mode=True)
    assert result.tx_id.startswith("base_sbx_")
    assert result.rail == "usdc-base"
