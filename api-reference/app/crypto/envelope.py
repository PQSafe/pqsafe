"""
PQSafe API Reference — canonical envelope serialization + ML-DSA-65 verification.

# TODO: switch to pqsafe-agent-pay SDK once published to PyPI.
#
# This module is a COPY of logic from:
#   /Users/tun/Projects/pqsafe/python-sdk/src/pqsafe/crypto.py
#   /Users/tun/Projects/pqsafe/python-sdk/src/pqsafe/envelope.py
#
# When the SDK is on PyPI, replace this file with:
#   from pqsafe.crypto import verify_bytes, active_backend
#   from pqsafe.envelope import verify_envelope, _envelope_to_bytes
#
# Until then, keep in sync manually with the python-sdk source.
"""

from __future__ import annotations

import json
import time
from typing import Optional

# ---------------------------------------------------------------------------
# Cryptographic backend — ML-DSA-65 (NIST FIPS 204) with Ed25519 fallback
# ---------------------------------------------------------------------------

_PQ_AVAILABLE = False
_BACKEND = "none"

try:
    from pqcrypto.sign.ml_dsa_65 import (  # type: ignore[import]
        generate_keypair as _ml_dsa_generate,
        sign as _ml_dsa_sign,
        verify as _ml_dsa_verify,
    )
    _PQ_AVAILABLE = True
    _BACKEND = "ml-dsa-65 (pqcrypto)"
except ImportError:
    pass

_ED25519_AVAILABLE = False

if not _PQ_AVAILABLE:
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (  # type: ignore[import]
            Ed25519PrivateKey,
            Ed25519PublicKey,
        )
        from cryptography.hazmat.primitives.serialization import (  # type: ignore[import]
            Encoding,
            NoEncryption,
            PrivateFormat,
            PublicFormat,
        )
        _ED25519_AVAILABLE = True
        _BACKEND = "ed25519 (CLASSICAL FALLBACK — NOT POST-QUANTUM)"
    except ImportError:
        pass

if not _PQ_AVAILABLE and not _ED25519_AVAILABLE:
    raise ImportError(
        "PQSafe API: no cryptographic backend found. "
        "Install pqcrypto>=0.4.0 for ML-DSA-65 (recommended) "
        "or `cryptography` for the classical Ed25519 fallback."
    )


def active_backend() -> str:
    return _BACKEND


def verify_bytes(message: bytes, signature: bytes, public_key: bytes) -> bool:
    """
    Verify a signature against a message and public key.
    Returns True on valid, False on any failure — does NOT raise.
    """
    if _PQ_AVAILABLE:
        try:
            result = _ml_dsa_verify(public_key, message, signature)
            if isinstance(result, bool):
                return result
            return True
        except Exception:
            return False

    # TODO: Replace with ML-DSA-65 once pqcrypto is available.
    # CLASSICAL FALLBACK — NOT POST-QUANTUM SECURE.
    try:
        pub = Ed25519PublicKey.from_public_bytes(public_key)  # type: ignore[name-defined]
        pub.verify(signature, message)  # type: ignore[name-defined]
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Canonical serialization — must match python-sdk envelope.py exactly
# ---------------------------------------------------------------------------

def envelope_to_canonical_bytes(envelope_dict: dict) -> bytes:
    """
    Re-serialize a camelCase envelope dict to canonical bytes for signature
    verification.  Keys sorted alphabetically — matches TypeScript SDK's
    Object.keys().sort() approach and python-sdk's _envelope_to_bytes().
    """
    raw = {
        "version": envelope_dict.get("version", 1),
        "issuer": envelope_dict["issuer"],
        "agent": envelope_dict["agent"],
        "maxAmount": envelope_dict["maxAmount"],
        "currency": envelope_dict["currency"],
        "allowedRecipients": envelope_dict["allowedRecipients"],
        "validFrom": envelope_dict["validFrom"],
        "validUntil": envelope_dict["validUntil"],
        "nonce": envelope_dict["nonce"],
    }
    if "rail" in envelope_dict and envelope_dict["rail"] is not None:
        raw["rail"] = envelope_dict["rail"]

    return json.dumps(raw, sort_keys=True, separators=(",", ":")).encode("utf-8")


# ---------------------------------------------------------------------------
# Full verification pipeline
# ---------------------------------------------------------------------------

def verify_signed_envelope(
    envelope_json: str,
    signature_hex: str,
    dsa_public_key_hex: str,
    *,
    skip_temporal: bool = False,
) -> dict:
    """
    Verify a signed envelope and return the parsed camelCase dict if valid.

    Checks (in order):
      1. ML-DSA-65 signature verification
      2. JSON parse + required-field presence
      3. Temporal validity (valid_from / valid_until) — skippable in tests

    Returns the parsed envelope dict on success.
    Raises ValueError with a descriptive message on any failure.
    """
    # 1. Signature
    try:
        pub_bytes = bytes.fromhex(dsa_public_key_hex)
        sig_bytes = bytes.fromhex(signature_hex)
    except ValueError as exc:
        raise ValueError(f"PQSafe: hex decode error — {exc}") from exc

    msg_bytes = envelope_json.encode("utf-8")
    if not verify_bytes(msg_bytes, sig_bytes, pub_bytes):
        raise ValueError("PQSafe: envelope signature verification failed")

    # 2. JSON parse
    try:
        raw = json.loads(envelope_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"PQSafe: envelope_json is not valid JSON — {exc}") from exc

    required = {"issuer", "agent", "maxAmount", "currency",
                "allowedRecipients", "validFrom", "validUntil", "nonce"}
    missing = required - set(raw.keys())
    if missing:
        raise ValueError(f"PQSafe: envelope missing fields: {missing}")

    # 3. Temporal validity
    if not skip_temporal:
        now = int(time.time())
        if now < raw["validFrom"]:
            raise ValueError(
                f"PQSafe: envelope not yet active (validFrom={raw['validFrom']})"
            )
        if now > raw["validUntil"]:
            raise ValueError(
                f"PQSafe: envelope expired (validUntil={raw['validUntil']})"
            )

    return raw
