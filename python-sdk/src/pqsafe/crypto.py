"""
PQSafe AgentPay — ML-DSA-65 cryptographic primitives.

Primary implementation: pqcrypto.sign.ml_dsa_65 (NIST FIPS 204 / ML-DSA-65).

Fallback (CLASSICAL — NOT POST-QUANTUM): If pqcrypto is unavailable, this
module falls back to Ed25519 from the `cryptography` library. The fallback is
clearly marked and MUST NOT be used in production deployments. It exists solely
to allow the SDK to be imported and tested in environments where pqcrypto cannot
be installed (e.g. some CI runners without libpqcrypto).

Key size comparison:
  ML-DSA-65 public key: 1952 bytes
  ML-DSA-65 secret key: 4032 bytes
  ML-DSA-65 signature:  3309 bytes

  Ed25519 public key:   32 bytes  (classical — not post-quantum secure)
  Ed25519 secret key:   32 bytes  (classical — not post-quantum secure)
  Ed25519 signature:    64 bytes  (classical — not post-quantum secure)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Tuple

# ---------------------------------------------------------------------------
# Attempt to load ML-DSA-65 (NIST FIPS 204)
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

# ---------------------------------------------------------------------------
# Classical fallback: Ed25519 from `cryptography`
# TODO: Remove classical fallback once pqcrypto is reliably installable in all
#       target environments. Ed25519 is NOT post-quantum secure.
# ---------------------------------------------------------------------------

_ED25519_AVAILABLE = False

if not _PQ_AVAILABLE:
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import (  # type: ignore[import]
            Ed25519PrivateKey,
            Ed25519PublicKey,
        )
        from cryptography.hazmat.primitives.serialization import (
            Encoding,
            PublicFormat,
            PrivateFormat,
            NoEncryption,
        )
        _ED25519_AVAILABLE = True
        _BACKEND = "ed25519 (CLASSICAL FALLBACK — NOT POST-QUANTUM)"
    except ImportError:
        pass

if not _PQ_AVAILABLE and not _ED25519_AVAILABLE:
    raise ImportError(
        "PQSafe: no cryptographic backend found. "
        "Install pqcrypto>=0.4.0 for ML-DSA-65 (recommended) "
        "or `cryptography` for the classical Ed25519 fallback."
    )


# ---------------------------------------------------------------------------
# Public key-pair container
# ---------------------------------------------------------------------------

@dataclass
class KeyPair:
    """
    A PQSafe signing key pair.

    Attributes
    ----------
    public_key : bytes
        The public verification key (hex-encode before storing or transmitting).
    secret_key : bytes
        The secret signing key (NEVER log or transmit this).
    backend : str
        Name of the cryptographic backend used (informational).
    """

    public_key: bytes
    secret_key: bytes
    backend: str

    def public_key_hex(self) -> str:
        """Return the public key as a lowercase hex string."""
        return self.public_key.hex()

    def secret_key_hex(self) -> str:
        """Return the secret key as a lowercase hex string. Handle with care."""
        return self.secret_key.hex()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def active_backend() -> str:
    """Return the name of the active cryptographic backend."""
    return _BACKEND


def generate_keypair() -> KeyPair:
    """
    Generate a new ML-DSA-65 key pair (or Ed25519 if pqcrypto is unavailable).

    Returns
    -------
    KeyPair
        A new key pair with public_key and secret_key as raw bytes.

    Notes
    -----
    ML-DSA-65 is the primary algorithm (NIST FIPS 204). The Ed25519 path is a
    classical fallback marked with a TODO — it is not post-quantum secure.
    """
    if _PQ_AVAILABLE:
        pk, sk = _ml_dsa_generate()
        return KeyPair(public_key=bytes(pk), secret_key=bytes(sk), backend=_BACKEND)

    # TODO: Replace Ed25519 fallback with ML-DSA-65 once pqcrypto is available.
    # CLASSICAL FALLBACK — NOT POST-QUANTUM SECURE.
    priv = Ed25519PrivateKey.generate()  # type: ignore[name-defined]
    pub = priv.public_key()
    sk_bytes = priv.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())  # type: ignore[name-defined]
    pk_bytes = pub.public_bytes(Encoding.Raw, PublicFormat.Raw)  # type: ignore[name-defined]
    return KeyPair(public_key=pk_bytes, secret_key=sk_bytes, backend=_BACKEND)


def sign_bytes(message: bytes, secret_key: bytes) -> bytes:
    """
    Sign a message with the secret key.

    Parameters
    ----------
    message : bytes
        The raw message bytes to sign.
    secret_key : bytes
        The secret key (from generate_keypair().secret_key).

    Returns
    -------
    bytes
        The raw signature bytes.
    """
    if _PQ_AVAILABLE:
        return bytes(_ml_dsa_sign(secret_key, message))

    # TODO: Replace with ML-DSA-65 once pqcrypto is available.
    # CLASSICAL FALLBACK — NOT POST-QUANTUM SECURE.
    priv = Ed25519PrivateKey.from_private_bytes(secret_key)  # type: ignore[name-defined]
    return priv.sign(message)


def verify_bytes(message: bytes, signature: bytes, public_key: bytes) -> bool:
    """
    Verify a signature against a message and public key.

    Parameters
    ----------
    message : bytes
        The raw message bytes that were signed.
    signature : bytes
        The signature bytes returned by sign_bytes().
    public_key : bytes
        The public key (from generate_keypair().public_key).

    Returns
    -------
    bool
        True if the signature is valid, False otherwise.

    Notes
    -----
    This function does NOT raise on invalid signatures — it returns False.
    Callers that need to raise (e.g. verify_envelope) should check the return value.
    """
    if _PQ_AVAILABLE:
        try:
            result = _ml_dsa_verify(public_key, message, signature)
            # pqcrypto.sign.ml_dsa_65.verify() returns True/False
            if isinstance(result, bool):
                return result
            # Some versions raise on failure, return None on success
            return True
        except Exception:
            return False

    # TODO: Replace with ML-DSA-65 once pqcrypto is available.
    # CLASSICAL FALLBACK — NOT POST-QUANTUM SECURE.
    try:
        pub = Ed25519PublicKey.from_public_bytes(public_key)  # type: ignore[name-defined]
        pub.verify(signature, message)
        return True
    except Exception:
        return False
