"""
PQSafe AgentPay — Cross-SDK canonical bytes interop test (Python side).

Reads /tmp/pqsafe-interop-test.json created by the TypeScript SDK's
cross-sdk-interop.test.ts and verifies:
  1. SHA-256 of the canonical envelope JSON matches what TypeScript produced.
  2. The inner envelope fields parse correctly (version=1, currency=USD, etc.).
  3. (Optional) ML-DSA-65 signature verifies — requires pqcrypto backend.

If /tmp/pqsafe-interop-test.json does not exist, the test is skipped so the
suite can run without requiring a prior TypeScript SDK test run.

To produce the fixture, run from the TypeScript SDK root:
    npx vitest run tests/cross-sdk-interop.test.ts

Then run this test:
    pytest tests/integration/test_cross_sdk_interop.py -v
"""

from __future__ import annotations

import hashlib
import json
import os

import pytest

from pqsafe.canonical import canonical_json_bytes, canonical_json_string

INTEROP_FILE = "/tmp/pqsafe-interop-test.json"

# ---------------------------------------------------------------------------
# Skip condition
# ---------------------------------------------------------------------------

_INTEROP_FILE_MISSING = not os.path.exists(INTEROP_FILE)

pytestmark = pytest.mark.skipif(
    _INTEROP_FILE_MISSING,
    reason=f"Interop fixture not found at {INTEROP_FILE}. "
    "Run TypeScript SDK cross-sdk-interop.test.ts first.",
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_interop_payload() -> dict:
    with open(INTEROP_FILE, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_interop_file_is_valid_json():
    """Sanity check: the file must be valid JSON with expected keys."""
    payload = _load_interop_payload()
    assert "canonicalSha256" in payload, "Missing canonicalSha256 in interop file"
    assert "signedEnvelope" in payload, "Missing signedEnvelope in interop file"
    signed = payload["signedEnvelope"]
    assert "envelopeJson" in signed
    assert "signature" in signed
    assert "dsaPublicKey" in signed


def test_sha256_of_envelope_json_matches_ts_hash():
    """
    The SHA-256 of the envelope JSON string (UTF-8) must match the hash
    that the TypeScript SDK computed and wrote to the file.

    This is the canonical byte-parity test: if Python and TypeScript produce
    the same JSON string, they agree on the serialization — including key order,
    quoting, and numeric formatting.
    """
    payload = _load_interop_payload()
    expected_sha256: str = payload["canonicalSha256"]
    envelope_json: str = payload["signedEnvelope"]["envelopeJson"]

    actual_sha256 = hashlib.sha256(envelope_json.encode("utf-8")).hexdigest()

    assert actual_sha256 == expected_sha256, (
        f"Canonical bytes mismatch!\n"
        f"  TypeScript produced: {expected_sha256}\n"
        f"  Python sees:        {actual_sha256}\n"
        f"  Envelope JSON:      {envelope_json[:200]}..."
    )


def test_envelope_json_parses_to_expected_fields():
    """
    The inner envelope JSON must parse to a valid SpendEnvelope with
    version=1, currency=USD, and anthropic.com/billing in allowedRecipients.
    """
    payload = _load_interop_payload()
    envelope_json: str = payload["signedEnvelope"]["envelopeJson"]
    inner = json.loads(envelope_json)

    assert inner["version"] == 1, f"Expected version=1, got {inner.get('version')}"
    assert inner["currency"] == "USD", f"Expected USD, got {inner.get('currency')}"
    assert "anthropic.com/billing" in inner.get("allowedRecipients", []), (
        "anthropic.com/billing not found in allowedRecipients"
    )
    assert inner["maxAmount"] == 200, f"Expected maxAmount=200, got {inner.get('maxAmount')}"
    assert inner["agent"] == "cross-sdk-interop-test-v1"


def test_python_canonical_json_bytes_are_deterministic():
    """
    canonical_json_bytes() must return the same bytes on repeated calls
    for the same input. This mirrors the TS determinism test.
    """
    payload = _load_interop_payload()
    envelope_json: str = payload["signedEnvelope"]["envelopeJson"]
    inner = json.loads(envelope_json)

    bytes1 = canonical_json_bytes(inner)
    bytes2 = canonical_json_bytes(inner)
    assert bytes1 == bytes2, "canonical_json_bytes() is not deterministic"


def test_python_canonicalization_matches_ts_envelope_json():
    """
    When Python re-canonicalizes the parsed envelope dict, it should produce
    byte-level identical output to what TypeScript produced.

    This validates that Python's RFC 8785 implementation (canonicaljson)
    matches TypeScript's (@noble/hashes + JSON.stringify sorted keys).
    """
    payload = _load_interop_payload()
    expected_envelope_json: str = payload["signedEnvelope"]["envelopeJson"]
    inner = json.loads(expected_envelope_json)

    # Re-canonicalize the same dict
    python_canonical = canonical_json_string(inner)

    assert python_canonical == expected_envelope_json, (
        f"Python canonicalization does not match TypeScript output!\n"
        f"  Expected: {expected_envelope_json}\n"
        f"  Python:   {python_canonical}"
    )


def test_signature_field_is_nonempty():
    """The signature field must be a non-empty hex string."""
    payload = _load_interop_payload()
    sig: str = payload["signedEnvelope"]["signature"]
    assert len(sig) > 0, "Signature is empty"
    # Should be valid hex
    bytes.fromhex(sig)


def test_public_key_field_is_nonempty():
    """The dsaPublicKey field must be a non-empty hex string."""
    payload = _load_interop_payload()
    pk: str = payload["signedEnvelope"]["dsaPublicKey"]
    assert len(pk) > 0, "dsaPublicKey is empty"
    bytes.fromhex(pk)


def test_ml_dsa65_signature_verifies_with_pqcrypto():
    """
    Attempt ML-DSA-65 signature verification using pqcrypto.
    Skips gracefully if pqcrypto is unavailable (classical fallback environment).
    """
    try:
        from pqcrypto.sign.ml_dsa_65 import verify as _ml_dsa_verify  # type: ignore[import]
    except ImportError:
        pytest.skip("pqcrypto not available — skipping cryptographic verification")

    payload = _load_interop_payload()
    signed = payload["signedEnvelope"]
    envelope_json: str = signed["envelopeJson"]
    sig_bytes = bytes.fromhex(signed["signature"])
    pk_bytes = bytes.fromhex(signed["dsaPublicKey"])
    msg_bytes = envelope_json.encode("utf-8")

    try:
        result = _ml_dsa_verify(pk_bytes, msg_bytes, sig_bytes)
        assert result is True or result is None, "ML-DSA-65 verification returned falsy"
    except Exception as exc:
        pytest.fail(f"ML-DSA-65 verification raised: {exc}")
