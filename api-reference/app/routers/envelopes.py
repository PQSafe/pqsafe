"""
PQSafe API Reference — /v1/envelopes router.

POST /v1/envelopes             — create envelope, return canonical hash for signing
POST /v1/envelopes/{id}/sign   — accept issuer signature, verify ML-DSA-65, store
GET  /v1/envelopes/{id}        — fetch envelope + signature status
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.crypto.envelope import active_backend, envelope_to_canonical_bytes, verify_signed_envelope
from app.store.memory_store import envelope_store, signed_envelope_store

router = APIRouter(prefix="/v1/envelopes", tags=["envelopes"])

RAIL_VALUES = {"airwallex", "wise", "stripe", "usdc-base", "x402"}

# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class CreateEnvelopeRequest(BaseModel):
    """Body for POST /v1/envelopes."""
    issuer_pubkey: str = Field(
        ...,
        description="ML-DSA-65 public key of the issuer, hex-encoded (1952 bytes = 3904 hex chars for ML-DSA-65, or 32 bytes = 64 hex chars for Ed25519 fallback)",
    )
    agent_id: str = Field(..., min_length=1, max_length=128, description="Agent identifier")
    issuer_address: str = Field(
        ...,
        description="PQSafe issuer address (pq1 + 40 hex chars)",
        pattern=r"^pq1[0-9a-f]{40}$",
    )
    max_amount: float = Field(..., gt=0, description="Maximum spend amount")
    currency: str = Field(..., min_length=3, max_length=3, description="ISO 4217 currency code")
    allowed_recipients: List[str] = Field(..., min_length=1, description="Allowlisted recipient addresses")
    valid_from: Optional[int] = Field(None, description="Unix timestamp — defaults to now")
    valid_until: Optional[int] = Field(None, description="Unix timestamp — defaults to now + 3600")
    nonce: Optional[str] = Field(None, description="128-bit hex nonce — generated if omitted")
    rail: Optional[str] = Field(None, description="Rail constraint: airwallex|wise|stripe|usdc-base|x402")

    @field_validator("rail")
    @classmethod
    def validate_rail(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in RAIL_VALUES:
            raise ValueError(f"rail must be one of {sorted(RAIL_VALUES)}")
        return v

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, v: str) -> str:
        return v.upper()


class EnvelopeRecord(BaseModel):
    """Stored envelope state."""
    id: str
    issuer_pubkey: str
    envelope_json: str
    canonical_hash: str
    signed: bool = False
    signature: Optional[str] = None
    created_at: str
    status: str  # "pending_signature" | "signed"


class CreateEnvelopeResponse(BaseModel):
    id: str
    envelope_json: str
    canonical_hash: str
    status: str
    crypto_backend: str
    created_at: str
    note: str


class SignEnvelopeRequest(BaseModel):
    """Body for POST /v1/envelopes/{id}/sign."""
    signature: str = Field(..., description="ML-DSA-65 signature over envelope_json bytes, hex-encoded")


class SignEnvelopeResponse(BaseModel):
    id: str
    status: str
    signed_at: str


class GetEnvelopeResponse(BaseModel):
    id: str
    envelope_json: str
    canonical_hash: str
    issuer_pubkey: str
    signed: bool
    signature: Optional[str]
    status: str
    created_at: str


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("", response_model=CreateEnvelopeResponse, status_code=201, summary="Create envelope")
async def create_envelope(body: CreateEnvelopeRequest) -> CreateEnvelopeResponse:
    """
    Build a new SpendEnvelope from the provided parameters.

    Returns the canonical JSON and its SHA-256 hash.  The issuer should sign
    the envelope_json bytes (UTF-8 encoded, keys sorted) with their ML-DSA-65
    secret key, then submit the signature to POST /v1/envelopes/{id}/sign.

    The issuer pubkey is stored so the API can verify the signature in the next step.
    """
    now = int(time.time())

    raw: dict[str, Any] = {
        "version": 1,
        "issuer": body.issuer_address,
        "agent": body.agent_id,
        "maxAmount": body.max_amount,
        "currency": body.currency,
        "allowedRecipients": body.allowed_recipients,
        "validFrom": body.valid_from if body.valid_from is not None else now,
        "validUntil": body.valid_until if body.valid_until is not None else now + 3600,
        "nonce": body.nonce if body.nonce is not None else os.urandom(16).hex(),
    }
    if body.rail is not None:
        raw["rail"] = body.rail

    canonical_bytes = envelope_to_canonical_bytes(raw)
    envelope_json = canonical_bytes.decode("utf-8")

    import hashlib
    canonical_hash = hashlib.sha256(canonical_bytes).hexdigest()

    envelope_id = str(uuid.uuid4())
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    record = EnvelopeRecord(
        id=envelope_id,
        issuer_pubkey=body.issuer_pubkey,
        envelope_json=envelope_json,
        canonical_hash=canonical_hash,
        signed=False,
        signature=None,
        created_at=created_at,
        status="pending_signature",
    )
    envelope_store.put(envelope_id, record.model_dump())

    return CreateEnvelopeResponse(
        id=envelope_id,
        envelope_json=envelope_json,
        canonical_hash=canonical_hash,
        status="pending_signature",
        crypto_backend=active_backend(),
        created_at=created_at,
        note=(
            "Sign the envelope_json bytes (UTF-8) with your ML-DSA-65 secret key "
            "and POST the hex signature to /v1/envelopes/{id}/sign"
        ),
    )


@router.post("/{envelope_id}/sign", response_model=SignEnvelopeResponse, summary="Submit signature")
async def sign_envelope(envelope_id: str, body: SignEnvelopeRequest) -> SignEnvelopeResponse:
    """
    Accept the issuer's ML-DSA-65 signature over the envelope, verify it,
    and mark the envelope as signed.

    After this call, the envelope is ready for use in POST /v1/pay.
    """
    record = envelope_store.get(envelope_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Envelope '{envelope_id}' not found")

    if record["signed"]:
        raise HTTPException(status_code=409, detail="Envelope is already signed")

    # Verify signature
    try:
        verify_signed_envelope(
            envelope_json=record["envelope_json"],
            signature_hex=body.signature,
            dsa_public_key_hex=record["issuer_pubkey"],
            skip_temporal=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    signed_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    record["signed"] = True
    record["signature"] = body.signature
    record["status"] = "signed"
    record["signed_at"] = signed_at

    envelope_store.put(envelope_id, record)
    signed_envelope_store.put(envelope_id, record)

    return SignEnvelopeResponse(id=envelope_id, status="signed", signed_at=signed_at)


@router.get("/{envelope_id}", response_model=GetEnvelopeResponse, summary="Get envelope")
async def get_envelope(envelope_id: str) -> GetEnvelopeResponse:
    """Fetch an envelope and its current signature status."""
    record = envelope_store.get(envelope_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Envelope '{envelope_id}' not found")

    return GetEnvelopeResponse(
        id=record["id"],
        envelope_json=record["envelope_json"],
        canonical_hash=record["canonical_hash"],
        issuer_pubkey=record["issuer_pubkey"],
        signed=record["signed"],
        signature=record.get("signature"),
        status=record["status"],
        created_at=record["created_at"],
    )
