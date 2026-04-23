"""
PQSafe AgentPay — SpendEnvelope creation, signing, and verification.

Mirrors the TypeScript SDK envelope.ts API (createEnvelope, signEnvelope,
verifyEnvelope) with Python-idiomatic snake_case naming.
"""

from __future__ import annotations

import json
import os
import time
from typing import List, Optional

from .crypto import KeyPair, generate_keypair, sign_bytes, verify_bytes
from .types import Rail, SignedEnvelope, SpendEnvelope


# ---------------------------------------------------------------------------
# Deterministic serialization
# ---------------------------------------------------------------------------

def _envelope_to_bytes(envelope: SpendEnvelope) -> bytes:
    """
    Serialize a SpendEnvelope to bytes for signing.

    Keys are sorted alphabetically for deterministic output across platforms,
    matching the TypeScript SDK's Object.keys().sort() approach.

    The wire format uses camelCase field names (TypeScript SDK compatibility).
    """
    raw: dict = {
        "version": envelope.version,
        "issuer": envelope.issuer,
        "agent": envelope.agent,
        "maxAmount": envelope.max_amount,
        "currency": envelope.currency,
        "allowedRecipients": envelope.allowed_recipients,
        "validFrom": envelope.valid_from,
        "validUntil": envelope.valid_until,
        "nonce": envelope.nonce,
    }
    if envelope.rail is not None:
        raw["rail"] = envelope.rail

    # Sort keys for reproducibility
    serialized = json.dumps(raw, sort_keys=True, separators=(",", ":"))
    return serialized.encode("utf-8")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_envelope(
    issuer: str,
    agent: str,
    max_amount: float,
    currency: str,
    allowed_recipients: List[str],
    starts_in_seconds: int = 0,
    ttl_seconds: int = 3600,
    rail: Optional[Rail] = None,
) -> SpendEnvelope:
    """
    Build a new (unsigned) SpendEnvelope.

    Parameters
    ----------
    issuer : str
        PQSafe address of the wallet owner (pq1 + 40 hex chars).
    agent : str
        Identifier of the AI agent being authorized (1-128 chars).
    max_amount : float
        Maximum total spend allowed by the agent (positive).
    currency : str
        ISO 4217 currency code (e.g. 'USD', 'HKD'). Uppercased automatically.
    allowed_recipients : list[str]
        Rail-specific recipient addresses the agent may pay to.
    starts_in_seconds : int
        Seconds from now before the envelope activates (default 0 = immediately).
    ttl_seconds : int
        Seconds the envelope remains valid (default 3600 = 1 hour).
    rail : Rail | None
        Optional rail constraint. None = router chooses.

    Returns
    -------
    SpendEnvelope
        Validated envelope ready to be signed with sign_envelope().

    Raises
    ------
    pydantic.ValidationError
        If any field is invalid (e.g. bad issuer format, empty recipients).
    """
    now = int(time.time())
    nonce = os.urandom(16).hex()

    raw = SpendEnvelope(
        issuer=issuer,
        agent=agent,
        max_amount=max_amount,
        currency=currency,
        allowed_recipients=allowed_recipients,
        valid_from=now + starts_in_seconds,
        valid_until=now + ttl_seconds,
        nonce=nonce,
        rail=rail,
    )
    return raw


def sign_envelope(envelope: SpendEnvelope, keypair: KeyPair) -> SignedEnvelope:
    """
    Sign a SpendEnvelope with the issuer's ML-DSA-65 key pair.

    Parameters
    ----------
    envelope : SpendEnvelope
        The envelope to sign (from create_envelope()).
    keypair : KeyPair
        The issuer's key pair (from generate_keypair()).

    Returns
    -------
    SignedEnvelope
        The signed envelope ready for agent use or transmission to the API.
    """
    msg_bytes = _envelope_to_bytes(envelope)
    sig_bytes = sign_bytes(msg_bytes, keypair.secret_key)

    return SignedEnvelope(
        envelope_json=msg_bytes.decode("utf-8"),
        signature=sig_bytes.hex(),
        dsa_public_key=keypair.public_key_hex(),
    )


def verify_envelope(
    signed: SignedEnvelope,
    public_key_bytes: Optional[bytes] = None,
    *,
    skip_temporal: bool = False,
) -> SpendEnvelope:
    """
    Verify a SignedEnvelope and return the parsed SpendEnvelope if valid.

    Checks performed (in order):
      1. ML-DSA-65 signature verification
      2. Pydantic schema validation
      3. Temporal validity (valid_from / valid_until)

    Parameters
    ----------
    signed : SignedEnvelope
        The signed envelope to verify.
    public_key_bytes : bytes | None
        Explicit public key to verify against. If None, the embedded
        dsa_public_key field is used (trust-on-first-use semantics).
    skip_temporal : bool
        If True, skip the valid_from / valid_until check. Useful in tests.

    Returns
    -------
    SpendEnvelope
        The parsed and validated inner envelope.

    Raises
    ------
    ValueError
        If the signature is invalid, schema is malformed, or envelope is expired.
    """
    # Resolve public key
    if public_key_bytes is None:
        try:
            public_key_bytes = bytes.fromhex(signed.dsa_public_key)
        except ValueError as exc:
            raise ValueError(f"PQSafe: dsaPublicKey is not valid hex — {exc}") from exc

    sig_bytes = bytes.fromhex(signed.signature)
    msg_bytes = signed.envelope_json.encode("utf-8")

    valid = verify_bytes(msg_bytes, sig_bytes, public_key_bytes)
    if not valid:
        raise ValueError("PQSafe: envelope signature verification failed")

    # Parse and validate schema
    try:
        raw_dict = json.loads(signed.envelope_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"PQSafe: envelope_json is not valid JSON — {exc}") from exc

    # Remap camelCase wire names to snake_case for Pydantic
    envelope = SpendEnvelope(
        issuer=raw_dict["issuer"],
        agent=raw_dict["agent"],
        max_amount=raw_dict["maxAmount"],
        currency=raw_dict["currency"],
        allowed_recipients=raw_dict["allowedRecipients"],
        valid_from=raw_dict["validFrom"],
        valid_until=raw_dict["validUntil"],
        nonce=raw_dict["nonce"],
        rail=raw_dict.get("rail"),
    )

    # Temporal validity
    if not skip_temporal:
        now = int(time.time())
        if now < envelope.valid_from:
            raise ValueError(
                f"PQSafe: envelope not yet active (valid_from={envelope.valid_from})"
            )
        if now > envelope.valid_until:
            raise ValueError(
                f"PQSafe: envelope expired (valid_until={envelope.valid_until})"
            )

    return envelope
