"""
pqsafe_openclaw.envelope — SpendEnvelope construction and AP2 dual-signing.

This module wraps ``pqsafe-agent-pay`` (the PQSafe Python SDK) and adds the
AP2 dual-signature envelope format: ECDSA-P256 + ML-DSA-65 over the
RFC 8785 JCS-canonical mandate bytes.

Arg-order note (Python ML-DSA)
-------------------------------
The TypeScript sibling of this module (using @noble/post-quantum v0.6.0)
discovered that ``ml_dsa65.sign`` takes args as ``sign(message, secretKey, opts)``
— message FIRST. This is the opposite of the pqcrypto Python library, which
uses ``sign(secret_key, message)`` — secret key FIRST.

We call:
    pqcrypto.sign.ml_dsa_65.sign(secret_key_bytes, message_bytes)

If you switch cryptographic backends, double-check the argument order.
The unit tests in tests/test_skill.py include a sign-then-verify round-trip
specifically to catch argument-order regressions.

Signing pipeline
----------------
1. Build the AP2 mandate dict (agent_id, amount, currency, nonce, etc.)
2. Serialize to RFC 8785 JCS canonical bytes (UTF-16 key sort, no whitespace)
3. ECDSA-P256: sign the raw canonical bytes directly (DER, then Base64url)
4. ML-DSA-65: sign the raw canonical bytes (HashML-DSA mode: SHA-256
   pre-hash → HashML-DSA §5.4, matching the AP2 RFC v8 spec)
5. Attach ``signature.alg = "ap2-ecdsa-p256+ap2-mldsa65"``

The dual-signature envelope is what gets returned to OpenClaw callers and
included in the SpendEnvelope ``pq_signature`` extension field.

HashML-DSA note
---------------
The AP2 RFC v8 §"Proposed Solution" specifies HashML-DSA mode (SHA-256
pre-hash) for verifier interoperability. This differs from pure-mode ML-DSA
(signing the full message directly). The two modes produce NON-INTEROPERABLE
signatures. This module always uses HashML-DSA (pre-hash) mode.

With pqcrypto v0.4+, pure-mode sign is:
    pqcrypto.sign.ml_dsa_65.sign(sk, message)

HashML-DSA is emulated by pre-hashing:
    import hashlib
    digest = hashlib.sha256(message).digest()
    sig = pqcrypto.sign.ml_dsa_65.sign(sk, digest)

This matches the TypeScript reference implementation and the verified test
vectors in 03_pqsafe_ap2_test_vectors_RESULTS.json.
"""

from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

# ---------------------------------------------------------------------------
# JCS canonicalization (RFC 8785)
# ---------------------------------------------------------------------------

try:
    import canonicaljson as _cjson  # type: ignore[import]

    def _jcs_bytes(obj: Dict[str, Any]) -> bytes:
        """Serialize obj to RFC 8785 canonical UTF-8 bytes."""
        raw: bytes = _cjson.encode_canonical_json(obj)
        return raw

except ImportError:
    import json as _json_fallback

    def _jcs_bytes(obj: Dict[str, Any]) -> bytes:  # type: ignore[misc]
        """
        Fallback: Python json with sort_keys=True.
        This is NOT a full RFC 8785 implementation (UTF-16 sort, -0 handling)
        but is sufficient for ASCII-key payloads in tests when canonicaljson
        is not installed.
        """
        return _json_fallback.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")


# ---------------------------------------------------------------------------
# Cryptographic backends
# ---------------------------------------------------------------------------

# --- ML-DSA-65 (primary, post-quantum) ---

_MLDSA_AVAILABLE = False
_mldsa_sign = None
_mldsa_verify = None
_mldsa_generate = None

try:
    from pqcrypto.sign.ml_dsa_65 import (  # type: ignore[import]
        generate_keypair as _pq_generate,
        sign as _pq_sign,
        verify as _pq_verify,
    )
    _mldsa_sign = _pq_sign
    _mldsa_verify = _pq_verify
    _mldsa_generate = _pq_generate
    _MLDSA_AVAILABLE = True
except ImportError:
    pass

# --- ECDSA-P256 (classical, required by AP2) ---

try:
    from cryptography.hazmat.primitives.asymmetric.ec import (  # type: ignore[import]
        ECDH,
        SECP256R1,
        EllipticCurvePrivateKey,
        EllipticCurvePublicKey,
        generate_private_key,
    )
    from cryptography.hazmat.primitives.asymmetric.utils import (  # type: ignore[import]
        decode_dss_signature,
        encode_dss_signature,
    )
    from cryptography.hazmat.primitives import hashes, serialization  # type: ignore[import]
    from cryptography.hazmat.primitives.asymmetric import ec  # type: ignore[import]
    _ECDSA_AVAILABLE = True
except ImportError:
    _ECDSA_AVAILABLE = False


def _b64url_encode(b: bytes) -> str:
    """Base64url encode (RFC 4648 §5, no padding)."""
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    """Base64url decode (RFC 4648 §5, add padding as needed)."""
    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)


# ---------------------------------------------------------------------------
# Key containers
# ---------------------------------------------------------------------------

@dataclass
class ECDSAKeyPair:
    """ECDSA-P256 key pair for AP2 classical signing."""
    private_key_bytes: bytes
    public_key_compressed_hex: str


@dataclass
class MLDSAKeyPair:
    """ML-DSA-65 key pair for PQ signing."""
    public_key: bytes
    secret_key: bytes

    def pubkey_fingerprint(self) -> str:
        """First 8 bytes of SHA-256(public_key) as hex — for envelope identification."""
        digest = hashlib.sha256(self.public_key).digest()
        return digest[:8].hex()

    def public_key_base64url(self) -> str:
        return _b64url_encode(self.public_key)


def generate_mldsa_keypair() -> MLDSAKeyPair:
    """Generate a fresh ML-DSA-65 key pair."""
    if not _MLDSA_AVAILABLE:
        raise ImportError(
            "pqsafe_openclaw: pqcrypto is required for ML-DSA-65 key generation. "
            "Install it with: pip install pqcrypto>=0.4.0"
        )
    pk, sk = _mldsa_generate()  # type: ignore[misc]
    return MLDSAKeyPair(public_key=bytes(pk), secret_key=bytes(sk))


def generate_ecdsa_keypair() -> ECDSAKeyPair:
    """Generate a fresh ECDSA-P256 key pair."""
    if not _ECDSA_AVAILABLE:
        raise ImportError(
            "pqsafe_openclaw: cryptography>=41.0 is required for ECDSA-P256. "
            "Install it with: pip install cryptography>=41.0"
        )
    private_key = generate_private_key(SECP256R1())
    priv_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub = private_key.public_key()
    pub_compressed = pub.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.CompressedPoint,
    )
    return ECDSAKeyPair(
        private_key_bytes=priv_bytes,
        public_key_compressed_hex=pub_compressed.hex(),
    )


# ---------------------------------------------------------------------------
# AP2 mandate model
# ---------------------------------------------------------------------------

@dataclass
class AP2Mandate:
    """
    An AP2-compatible payment mandate with optional PQ extension fields.

    Mirrors the AP2 v0.1 mandate schema, extended with the PQSafe PQ fields
    proposed in the AP2 RFC v8 (pqsafe.xyz/ap2-pq-rfc).

    The ``signature`` field is populated by ``build_ap2_envelope()``.
    """
    agent_id: str
    currency: str
    nonce: str
    amount: Optional[str] = None          # string decimal (e.g. "125.00")
    spend_cap: Optional[float] = None     # numeric (e.g. 50000)
    recipient: Optional[str] = None
    payee_constraints: Optional[list] = None
    issued_at: Optional[str] = None       # ISO-8601 UTC
    pq_algorithm: Optional[str] = None   # "ML-DSA-65"
    pq_canonicalization: Optional[str] = None  # "JCS"
    expiry: Optional[str] = None          # ISO-8601 UTC
    signature: Optional[Dict[str, Any]] = None  # filled by build_ap2_envelope

    def to_dict(self) -> Dict[str, Any]:
        """
        Return the mandate as a plain dict, omitting None fields.
        Key order is irrelevant here — JCS canonicalization handles sorting.
        """
        d: Dict[str, Any] = {"agent_id": self.agent_id, "currency": self.currency, "nonce": self.nonce}
        if self.amount is not None:
            d["amount"] = self.amount
        if self.spend_cap is not None:
            d["spend_cap"] = self.spend_cap
        if self.recipient is not None:
            d["recipient"] = self.recipient
        if self.payee_constraints is not None:
            d["payee_constraints"] = self.payee_constraints
        if self.issued_at is not None:
            d["issued_at"] = self.issued_at
        if self.pq_algorithm is not None:
            d["pq_algorithm"] = self.pq_algorithm
        if self.pq_canonicalization is not None:
            d["pq_canonicalization"] = self.pq_canonicalization
        if self.expiry is not None:
            d["expiry"] = self.expiry
        if self.signature is not None:
            d["signature"] = self.signature
        return d


@dataclass
class DualSignedEnvelope:
    """
    A dual-signed AP2 mandate: ECDSA-P256 + ML-DSA-65.

    This is the AP2 PQ extension format proposed in RFC v8. Both signatures
    cover the same JCS-canonical bytes of the mandate body (without the
    ``signature`` field, exactly as AP2 mandates sign the body before
    appending the signature).
    """
    mandate: AP2Mandate
    jcs_bytes: bytes
    ecdsa_sig_base64url: str
    mldsa_sig_base64url: str
    pubkey_fingerprint: str

    def to_dict(self) -> Dict[str, Any]:
        """Return the full signed envelope as a JSON-serializable dict."""
        body = self.mandate.to_dict()
        body["signature"] = {
            "alg": "ap2-ecdsa-p256+ap2-mldsa65",
            "ecdsa": self.ecdsa_sig_base64url,
            "mldsa": self.mldsa_sig_base64url,
            "pubkey_fingerprint": self.pubkey_fingerprint,
        }
        return body


# ---------------------------------------------------------------------------
# Signing helpers
# ---------------------------------------------------------------------------

def _mldsa_sign_hashmldsa(message_bytes: bytes, secret_key: bytes) -> bytes:
    """
    Sign message using HashML-DSA mode (SHA-256 pre-hash, per FIPS 204 §5.4).

    The AP2 RFC v8 §"Proposed Solution" specifies HashML-DSA (pre-hash) mode
    so that verifiers only need the 32-byte SHA-256 fingerprint, not the full
    potentially-large message. Pure-mode ML-DSA (no pre-hash) produces
    non-interoperable signatures.

    pqcrypto argument order: sign(secret_key, message) — SECRET KEY FIRST.
    This is opposite to @noble/post-quantum v0.6.0 which takes message first.
    """
    if not _MLDSA_AVAILABLE:
        raise ImportError(
            "pqsafe_openclaw: pqcrypto>=0.4.0 required for ML-DSA-65 signing. "
            "pip install pqcrypto>=0.4.0"
        )
    # HashML-DSA: pre-hash with SHA-256, then sign the digest
    digest = hashlib.sha256(message_bytes).digest()
    # pqcrypto.sign.ml_dsa_65.sign(secret_key, message) — SK FIRST
    sig_bytes = _mldsa_sign(secret_key, digest)  # type: ignore[misc]
    return bytes(sig_bytes)


def _mldsa_verify_hashmldsa(message_bytes: bytes, sig_bytes: bytes, public_key: bytes) -> bool:
    """
    Verify a HashML-DSA signature (SHA-256 pre-hash mode).

    pqcrypto argument order: verify(public_key, message, signature) — PK FIRST.
    """
    if not _MLDSA_AVAILABLE:
        raise ImportError("pqsafe_openclaw: pqcrypto>=0.4.0 required for verification.")
    digest = hashlib.sha256(message_bytes).digest()
    try:
        result = _mldsa_verify(public_key, digest, sig_bytes)  # type: ignore[misc]
        if isinstance(result, bool):
            return result
        return True  # some versions return None on success, raise on failure
    except Exception:
        return False


def _ecdsa_sign_der(message_bytes: bytes, private_key_bytes: bytes) -> bytes:
    """Sign message with ECDSA-P256 and return DER-encoded signature."""
    if not _ECDSA_AVAILABLE:
        raise ImportError(
            "pqsafe_openclaw: cryptography>=41.0 required for ECDSA-P256. "
            "pip install cryptography>=41.0"
        )
    priv = serialization.load_der_private_key(private_key_bytes, password=None)
    sig_der = priv.sign(message_bytes, ec.ECDSA(hashes.SHA256()))
    return sig_der


def _ecdsa_verify_der(message_bytes: bytes, sig_der: bytes, public_key_compressed_hex: str) -> bool:
    """Verify an ECDSA-P256 DER signature against a compressed public key."""
    if not _ECDSA_AVAILABLE:
        raise ImportError("pqsafe_openclaw: cryptography>=41.0 required.")
    try:
        pub_bytes = bytes.fromhex(public_key_compressed_hex)
        pub_key = ec.EllipticCurvePublicKey.from_encoded_point(SECP256R1(), pub_bytes)
        pub_key.verify(sig_der, message_bytes, ec.ECDSA(hashes.SHA256()))
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_ap2_envelope(
    mandate: AP2Mandate,
    ecdsa_keypair: ECDSAKeyPair,
    mldsa_keypair: MLDSAKeyPair,
) -> DualSignedEnvelope:
    """
    Sign an AP2 mandate with ECDSA-P256 + ML-DSA-65 (HashML-DSA mode).

    Signing steps:
    1. Serialize the mandate body (without ``signature`` field) to RFC 8785
       JCS canonical bytes.
    2. Sign the raw JCS bytes with ECDSA-P256 → DER → Base64url.
    3. Sign the raw JCS bytes with ML-DSA-65 (HashML-DSA / SHA-256 pre-hash)
       → Base64url.
    4. Attach the dual signature block to the mandate.

    Parameters
    ----------
    mandate : AP2Mandate
        The unsigned mandate (``signature`` field must be None).
    ecdsa_keypair : ECDSAKeyPair
        ECDSA-P256 key pair (from ``generate_ecdsa_keypair()`` or loaded).
    mldsa_keypair : MLDSAKeyPair
        ML-DSA-65 key pair (from ``generate_mldsa_keypair()`` or loaded).

    Returns
    -------
    DualSignedEnvelope
        The signed envelope ready for AP2 transmission or agent verification.
    """
    # Step 1: canonical bytes (body only, no signature field)
    body = mandate.to_dict()
    body.pop("signature", None)  # ensure signature field is absent during signing
    jcs = _jcs_bytes(body)

    # Step 2: ECDSA-P256 sign
    ecdsa_der = _ecdsa_sign_der(jcs, ecdsa_keypair.private_key_bytes)
    ecdsa_b64 = _b64url_encode(ecdsa_der)

    # Step 3: ML-DSA-65 sign (HashML-DSA mode — SHA-256 pre-hash)
    mldsa_sig = _mldsa_sign_hashmldsa(jcs, mldsa_keypair.secret_key)
    mldsa_b64 = _b64url_encode(mldsa_sig)

    return DualSignedEnvelope(
        mandate=mandate,
        jcs_bytes=jcs,
        ecdsa_sig_base64url=ecdsa_b64,
        mldsa_sig_base64url=mldsa_b64,
        pubkey_fingerprint=mldsa_keypair.pubkey_fingerprint(),
    )


def verify_ap2_envelope(
    envelope_dict: Dict[str, Any],
    mldsa_public_key: bytes,
    ecdsa_public_key_compressed_hex: Optional[str] = None,
) -> bool:
    """
    Verify a dual-signed AP2 envelope.

    Verifies the ML-DSA-65 signature (always). If ``ecdsa_public_key_compressed_hex``
    is provided, also verifies the ECDSA-P256 signature.

    Parameters
    ----------
    envelope_dict : dict
        The full envelope dict including the ``signature`` block.
    mldsa_public_key : bytes
        ML-DSA-65 public key bytes.
    ecdsa_public_key_compressed_hex : str | None
        Optional compressed ECDSA-P256 public key hex for classical verification.

    Returns
    -------
    bool
        True if all requested signatures verify successfully.

    Raises
    ------
    ValueError
        If the signature block is malformed or verification fails.
    """
    sig_block = envelope_dict.get("signature")
    if not sig_block:
        raise ValueError("verify_ap2_envelope: no 'signature' block in envelope")

    alg = sig_block.get("alg", "")
    if alg != "ap2-ecdsa-p256+ap2-mldsa65":
        raise ValueError(f"verify_ap2_envelope: unsupported alg '{alg}'")

    # Reconstruct the body without the signature field
    body = {k: v for k, v in envelope_dict.items() if k != "signature"}
    jcs = _jcs_bytes(body)

    # Verify ML-DSA-65
    mldsa_b64 = sig_block.get("mldsa", "")
    mldsa_sig = _b64url_decode(mldsa_b64)
    if not _mldsa_verify_hashmldsa(jcs, mldsa_sig, mldsa_public_key):
        raise ValueError("verify_ap2_envelope: ML-DSA-65 signature verification failed")

    # Optionally verify ECDSA-P256
    if ecdsa_public_key_compressed_hex is not None:
        ecdsa_b64 = sig_block.get("ecdsa", "")
        ecdsa_der = _b64url_decode(ecdsa_b64)
        if not _ecdsa_verify_der(jcs, ecdsa_der, ecdsa_public_key_compressed_hex):
            raise ValueError("verify_ap2_envelope: ECDSA-P256 signature verification failed")

    return True
