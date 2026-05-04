"""
tests/test_integration.py — Integration tests for pqsafe_openclaw.

These tests build a real SpendEnvelope, sign it with ML-DSA-65, and verify it
round-trip using the pqsafe-agent-pay SDK. They do NOT make network calls;
PQSAFE_MOCK_MODE is set to 1 for all tests.

Integration test coverage
--------------------------
1. Full pay() pipeline: key gen → envelope → sign → verify → mock pay
2. set_envelope() → reuse → verify
3. build_ap2_envelope() → verify_ap2_envelope() (dual-sign round-trip)
4. CLI entry point JSON output

All tests require pqcrypto >= 0.4.0 (for ML-DSA-65) and pqsafe-agent-pay >= 0.1.0.
Tests are skipped gracefully if either dependency is missing.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict

import pytest

# Mark all tests in this module as integration
pytestmark = pytest.mark.integration

# ---------------------------------------------------------------------------
# Helper: skip if dependencies missing
# ---------------------------------------------------------------------------

def _require_pqsafe():
    try:
        import pqsafe  # type: ignore[import]  # noqa: F401
    except ImportError:
        pytest.skip("pqsafe-agent-pay not installed — pip install pqsafe-agent-pay>=0.1.0")


def _require_pqcrypto():
    try:
        from pqcrypto.sign.ml_dsa_65 import generate_keypair  # type: ignore[import]  # noqa: F401
    except ImportError:
        pytest.skip("pqcrypto not installed — pip install pqcrypto>=0.4.0")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

ISSUER = "pq1" + "b" * 40
AGENT = "raymond-ai-coo-openclaw-integration-v1"
RECIPIENT_HKD = "did:web:seniordeli.com:payee:main"
RECIPIENT_USD = "did:web:anthropic.com:payee:api-billing"
AMOUNT_HKD = 125.0
AMOUNT_USD = 49.99


@pytest.fixture(scope="session", autouse=True)
def set_mock_mode():
    """Ensure all integration tests run in mock mode (no network)."""
    old = os.environ.get("PQSAFE_MOCK_MODE")
    os.environ["PQSAFE_MOCK_MODE"] = "1"
    yield
    if old is None:
        del os.environ["PQSAFE_MOCK_MODE"]
    else:
        os.environ["PQSAFE_MOCK_MODE"] = old


@pytest.fixture(scope="session")
def skill():
    from pqsafe_openclaw.skill import PQSafeSkill
    return PQSafeSkill(mock_mode=True)


@pytest.fixture(scope="session")
def mldsa_kp():
    _require_pqcrypto()
    from pqsafe_openclaw.envelope import generate_mldsa_keypair
    return generate_mldsa_keypair()


@pytest.fixture(scope="session")
def ecdsa_kp():
    try:
        from pqsafe_openclaw.envelope import generate_ecdsa_keypair
        return generate_ecdsa_keypair()
    except ImportError:
        pytest.skip("cryptography package not installed")


# ---------------------------------------------------------------------------
# Test 1: Full pay() round-trip
# ---------------------------------------------------------------------------

class TestFullPayRoundTrip:
    """End-to-end pay() pipeline: key gen → create → sign → verify → mock submit."""

    def test_hkd_payment_via_airwallex(self, skill):
        _require_pqsafe()

        result = skill.pay(
            issuer=ISSUER,
            agent=AGENT,
            recipient=RECIPIENT_HKD,
            amount=AMOUNT_HKD,
            currency="HKD",
            rail="airwallex",
        )

        assert result.ok, f"Integration pay() failed: {result.error}"
        d = result.result
        assert d["tx_id"].startswith("awx_sbx"), f"Wrong tx_id prefix: {d['tx_id']}"
        assert d["status"] == "mock_confirmed"
        assert d["rail"] == "airwallex"
        assert d["amount"] == AMOUNT_HKD
        assert d["currency"] == "HKD"
        assert d["mock_mode"] is True

    def test_usd_payment_via_wise(self, skill):
        _require_pqsafe()

        result = skill.pay(
            issuer=ISSUER,
            agent=AGENT,
            recipient=RECIPIENT_USD,
            amount=AMOUNT_USD,
            currency="USD",
            rail="wise",
        )

        assert result.ok, f"USD Wise payment failed: {result.error}"
        assert result.result["tx_id"].startswith("wise_sbx")
        assert result.result["rail"] == "wise"

    def test_usdc_payment_via_base(self, skill):
        _require_pqsafe()

        result = skill.pay(
            issuer=ISSUER,
            agent=AGENT,
            recipient="0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
            amount=10.0,
            currency="USDC",
        )

        assert result.ok, f"USDC payment failed: {result.error}"
        assert result.result["tx_id"].startswith("base_sbx")

    def test_pq_backend_is_mldsa(self, skill):
        """Confirm ML-DSA-65 backend is active (not Ed25519 classical fallback)."""
        _require_pqsafe()
        _require_pqcrypto()

        result = skill.pay(
            issuer=ISSUER,
            agent=AGENT,
            recipient=RECIPIENT_HKD,
            amount=1.0,
            currency="HKD",
        )

        assert result.ok
        assert "ml-dsa-65" in result.result.get("pq_backend", "").lower(), (
            f"Expected ML-DSA-65 backend, got: {result.result.get('pq_backend')}"
        )

    def test_amount_exceeds_ceiling_rejected(self, skill):
        """Payment above envelope max_amount must be rejected by guardrails."""
        _require_pqsafe()

        # pay() sets max_amount = amount, so paying amount+1 must fail
        # We test this by creating an envelope separately and using it
        from pqsafe_openclaw.skill import PQSafeSkill

        # First create an envelope for 10.0
        envelope_result = skill.set_envelope(
            issuer=ISSUER,
            agent=AGENT,
            max_amount=10.0,
            currency="HKD",
            allowed_recipients=[RECIPIENT_HKD],
        )
        if not envelope_result.ok:
            pytest.skip(f"set_envelope failed: {envelope_result.error}")

        # Now try to pay 999.0 using the SDK directly
        try:
            import pqsafe  # type: ignore[import]
            from pqsafe import pay as sdk_pay, SignedEnvelope

            er = envelope_result.result
            signed = SignedEnvelope(
                envelope_json=er["envelope_json"],
                signature=er["signature"],
                dsa_public_key=er["dsa_public_key"],
            )

            with pytest.raises(ValueError, match="exceeds envelope max_amount"):
                sdk_pay(
                    signed,
                    recipient=RECIPIENT_HKD,
                    amount=999.0,
                    mock_mode=True,
                )
        except ImportError:
            pytest.skip("pqsafe not installed")

    def test_wrong_recipient_rejected(self, skill):
        """Payment to recipient not in allowlist must be rejected."""
        _require_pqsafe()

        try:
            from pqsafe import pay as sdk_pay, SignedEnvelope

            envelope_result = skill.set_envelope(
                issuer=ISSUER,
                agent=AGENT,
                max_amount=100.0,
                currency="HKD",
                allowed_recipients=[RECIPIENT_HKD],  # only seniordeli allowed
            )
            if not envelope_result.ok:
                pytest.skip(f"set_envelope failed: {envelope_result.error}")

            er = envelope_result.result
            signed = SignedEnvelope(
                envelope_json=er["envelope_json"],
                signature=er["signature"],
                dsa_public_key=er["dsa_public_key"],
            )

            with pytest.raises(ValueError, match="not in the envelope allowlist"):
                sdk_pay(
                    signed,
                    recipient="did:web:evil.com:payee:attacker",  # not in allowlist
                    amount=50.0,
                    mock_mode=True,
                )
        except ImportError:
            pytest.skip("pqsafe not installed")


# ---------------------------------------------------------------------------
# Test 2: set_envelope() → re-use
# ---------------------------------------------------------------------------

class TestSetEnvelopeReuse:
    """Pre-build an envelope with set_envelope() and use it for multiple pays."""

    def test_set_envelope_then_pay_multiple(self, skill):
        _require_pqsafe()

        from pqsafe import pay as sdk_pay, SignedEnvelope

        # Build a multi-recipient envelope
        recipients = [
            "did:web:vendor-a.com:payee",
            "did:web:vendor-b.com:payee",
        ]
        envelope_result = skill.set_envelope(
            issuer=ISSUER,
            agent=AGENT,
            max_amount=500.0,
            currency="HKD",
            allowed_recipients=recipients,
            ttl_seconds=7200,
        )
        assert envelope_result.ok, f"set_envelope failed: {envelope_result.error}"

        er = envelope_result.result
        signed = SignedEnvelope(
            envelope_json=er["envelope_json"],
            signature=er["signature"],
            dsa_public_key=er["dsa_public_key"],
        )

        # Pay to vendor A
        result_a = sdk_pay(signed, recipient=recipients[0], amount=100.0, mock_mode=True)
        assert result_a.status == "mock_confirmed"

        # Pay to vendor B (same envelope, different recipient — both in allowlist)
        result_b = sdk_pay(signed, recipient=recipients[1], amount=200.0, mock_mode=True)
        assert result_b.status == "mock_confirmed"

    def test_set_envelope_signature_hex_length(self, skill):
        """ML-DSA-65 signature must be 3309 bytes = 6618 hex chars."""
        _require_pqsafe()
        _require_pqcrypto()

        result = skill.set_envelope(
            issuer=ISSUER,
            agent=AGENT,
            max_amount=100.0,
            currency="USD",
            allowed_recipients=["did:web:test.com:payee"],
        )
        assert result.ok

        sig_hex = result.result["signature"]
        sig_bytes = bytes.fromhex(sig_hex)
        assert len(sig_bytes) == 3309, (
            f"ML-DSA-65 signature must be 3309 bytes, got {len(sig_bytes)}"
        )

    def test_set_envelope_public_key_length(self, skill):
        """ML-DSA-65 public key must be 1952 bytes = 3904 hex chars."""
        _require_pqsafe()
        _require_pqcrypto()

        result = skill.set_envelope(
            issuer=ISSUER,
            agent=AGENT,
            max_amount=50.0,
            currency="HKD",
            allowed_recipients=["did:web:test.com:payee"],
        )
        assert result.ok

        pk_hex = result.result["dsa_public_key"]
        pk_bytes = bytes.fromhex(pk_hex)
        assert len(pk_bytes) == 1952, (
            f"ML-DSA-65 public key must be 1952 bytes, got {len(pk_bytes)}"
        )


# ---------------------------------------------------------------------------
# Test 3: AP2 dual-sign round-trip (build_ap2_envelope → verify_ap2_envelope)
# ---------------------------------------------------------------------------

class TestAP2DualSignRoundTrip:
    """Build and verify a dual-signed AP2 envelope using the envelope module."""

    def test_build_and_verify_dual_signed_envelope(self, mldsa_kp, ecdsa_kp):
        from pqsafe_openclaw.envelope import AP2Mandate, build_ap2_envelope, verify_ap2_envelope

        mandate = AP2Mandate(
            agent_id="did:web:agents.pqsafe.xyz:raymond-coo",
            amount="125.00",
            currency="HKD",
            nonce="6b86b273ff34fce19d6b804eff5a3f57",
            recipient="did:web:seniordeli.com:payee:main",
        )

        signed = build_ap2_envelope(mandate, ecdsa_kp, mldsa_kp)

        # Verify ML-DSA-65 only
        valid = verify_ap2_envelope(
            envelope_dict=signed.to_dict(),
            mldsa_public_key=mldsa_kp.public_key,
        )
        assert valid is True

    def test_dual_sign_with_ecdsa_verification(self, mldsa_kp, ecdsa_kp):
        from pqsafe_openclaw.envelope import AP2Mandate, build_ap2_envelope, verify_ap2_envelope

        mandate = AP2Mandate(
            agent_id="did:web:agents.pqsafe.xyz:integration-test",
            spend_cap=50000,
            currency="HKD",
            nonce="d4735e3a265e16eee03f59718b9b5d03",
            payee_constraints=[
                {"payee_id": "did:web:airwallex.com:merchant:aw_test"},
                {"payee_id": "did:web:wise.com:account:P123"},
            ],
        )

        signed = build_ap2_envelope(mandate, ecdsa_kp, mldsa_kp)
        envelope_dict = signed.to_dict()

        # Verify both ECDSA + ML-DSA-65
        valid = verify_ap2_envelope(
            envelope_dict=envelope_dict,
            mldsa_public_key=mldsa_kp.public_key,
            ecdsa_public_key_compressed_hex=ecdsa_kp.public_key_compressed_hex,
        )
        assert valid is True

    def test_tampered_envelope_fails_verification(self, mldsa_kp, ecdsa_kp):
        """Modifying the envelope body after signing must fail verification."""
        from pqsafe_openclaw.envelope import AP2Mandate, build_ap2_envelope, verify_ap2_envelope

        mandate = AP2Mandate(
            agent_id="did:web:agents.pqsafe.xyz:tamper-test",
            amount="100.00",
            currency="USD",
            nonce="aaaa1111bbbb2222cccc3333dddd4444",
            recipient="did:web:legit.com:payee",
        )

        signed = build_ap2_envelope(mandate, ecdsa_kp, mldsa_kp)
        envelope_dict = signed.to_dict()

        # Tamper with the amount
        envelope_dict["amount"] = "999999.00"

        with pytest.raises(ValueError, match="ML-DSA-65 signature verification failed"):
            verify_ap2_envelope(
                envelope_dict=envelope_dict,
                mldsa_public_key=mldsa_kp.public_key,
            )

    def test_envelope_signature_alg_field(self, mldsa_kp, ecdsa_kp):
        from pqsafe_openclaw.envelope import AP2Mandate, build_ap2_envelope

        mandate = AP2Mandate(
            agent_id="did:web:test",
            currency="HKD",
            nonce="11112222333344445555666677778888",
            amount="1.00",
            recipient="did:web:payee.com:acct",
        )

        signed = build_ap2_envelope(mandate, ecdsa_kp, mldsa_kp)
        d = signed.to_dict()

        assert d["signature"]["alg"] == "ap2-ecdsa-p256+ap2-mldsa65"

    def test_pubkey_fingerprint_format(self, mldsa_kp, ecdsa_kp):
        """Fingerprint = first 16 hex chars of SHA-256(public_key)."""
        from pqsafe_openclaw.envelope import AP2Mandate, build_ap2_envelope

        mandate = AP2Mandate(
            agent_id="did:web:fp-test",
            currency="HKD",
            nonce="ffffeeeeddddccccbbbbaaaa99998888",
            amount="50.00",
            recipient="did:web:fp-payee.com:acct",
        )

        signed = build_ap2_envelope(mandate, ecdsa_kp, mldsa_kp)
        d = signed.to_dict()

        expected_fp = hashlib.sha256(mldsa_kp.public_key).hexdigest()[:16]
        assert d["signature"]["pubkey_fingerprint"] == expected_fp

    def test_hashmldsa_vs_pure_mldsa_differ(self, mldsa_kp):
        """
        HashML-DSA (pre-hash) and pure-mode ML-DSA produce different signatures.
        This test documents the non-interoperability explicitly.
        """
        try:
            from pqcrypto.sign.ml_dsa_65 import sign  # type: ignore[import]
        except ImportError:
            pytest.skip("pqcrypto not installed")

        message = b'{"test":"hashmldsa_vs_pure"}'

        # Pure-mode: sign the full message
        pure_sig = bytes(sign(mldsa_kp.secret_key, message))

        # HashML-DSA: sign the SHA-256 digest
        digest = hashlib.sha256(message).digest()
        hash_sig = bytes(sign(mldsa_kp.secret_key, digest))

        # They must be different (probabilistic, but overwhelmingly true for any message)
        assert pure_sig != hash_sig, (
            "Pure-mode and HashML-DSA signatures are identical — this is unexpected "
            "and suggests a cryptographic implementation issue."
        )


# ---------------------------------------------------------------------------
# Test 4: CLI entry point
# ---------------------------------------------------------------------------

class TestCLIEntryPoint:
    """Test the python -m pqsafe_openclaw CLI interface (used by TS bridge)."""

    @pytest.fixture(autouse=True)
    def cli_env(self):
        """Add the package root to PYTHONPATH so the subprocess can import it."""
        pkg_root = str(Path(__file__).parent.parent)
        env = {**os.environ, "PQSAFE_MOCK_MODE": "1"}
        # Prepend to PYTHONPATH
        existing = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = f"{pkg_root}:{existing}" if existing else pkg_root
        self._cli_env = env

    def test_query_action_via_cli(self):
        """CLI query action returns valid JSON with ok=true."""
        _require_pqsafe()

        args = json.dumps({"tx_id": "awx_sbx_1234567890_abcd"})
        proc = subprocess.run(
            [sys.executable, "-m", "pqsafe_openclaw", "query", args],
            capture_output=True,
            text=True,
            env=self._cli_env,
        )

        assert proc.returncode == 0, f"CLI exited with {proc.returncode}: {proc.stderr}"
        result = json.loads(proc.stdout)
        assert result["ok"] is True
        assert result["action"] == "query"
        assert result["result"]["status"] == "mock_confirmed"

    def test_unknown_action_via_cli(self):
        """Unknown action returns error JSON and exit code 1."""
        args = json.dumps({})
        proc = subprocess.run(
            [sys.executable, "-m", "pqsafe_openclaw", "fly_to_moon", args],
            capture_output=True,
            text=True,
            env=self._cli_env,
        )

        assert proc.returncode == 1
        result = json.loads(proc.stdout)
        assert result["ok"] is False
        assert "Unknown action" in result["error"]

    def test_invalid_json_args_via_cli(self):
        """Invalid JSON args returns error JSON and exit code 1."""
        proc = subprocess.run(
            [sys.executable, "-m", "pqsafe_openclaw", "query", "not-valid-json"],
            capture_output=True,
            text=True,
            env=self._cli_env,
        )

        assert proc.returncode == 1
        result = json.loads(proc.stdout)
        assert result["ok"] is False
        assert "Invalid JSON" in result["error"]
