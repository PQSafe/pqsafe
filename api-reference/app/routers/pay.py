"""
PQSafe API Reference — /v1/pay router.

POST /v1/pay               — verify envelope, enforce constraints, route to rail
GET  /v1/pay/{transfer_id} — fetch rail transfer status (poll Airwallex)
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.crypto.envelope import verify_signed_envelope
from app.rails.airwallex import execute_payment, get_transfer_status
from app.store.memory_store import nonce_store, signed_envelope_store, transfer_store

router = APIRouter(prefix="/v1/pay", tags=["pay"])


# ---------------------------------------------------------------------------
# Request / response schemas — field names mirror TypeScript SDK wire format
# ---------------------------------------------------------------------------

class PayRequest(BaseModel):
    """
    Body for POST /v1/pay.

    Two usage modes:
      A. envelope_id (envelope already registered via /v1/envelopes)
      B. inline signed_envelope (one-shot — create + pay without pre-registration)

    Mode A is preferred for server-to-server. Mode B matches the TypeScript SDK
    payload format so SDK consumers can migrate to hosted API with a config change.
    """
    # Mode A — pre-registered envelope
    envelope_id: Optional[str] = Field(None, description="ID from POST /v1/envelopes/{id}/sign")

    # Mode B — inline signed envelope (matches TypeScript SDK wire format)
    envelope_json: Optional[str] = Field(None, description="Canonical envelope JSON")
    signature: Optional[str] = Field(None, description="ML-DSA-65 signature hex")
    dsa_public_key: Optional[str] = Field(None, alias="dsaPublicKey", description="Issuer public key hex")

    # Payment details — always required
    recipient: str = Field(..., description="Recipient address (rail-specific format)")
    amount: float = Field(..., gt=0, description="Amount to transfer")
    memo: Optional[str] = Field(None, description="Human-readable memo / reference")

    model_config = {"populate_by_name": True}


class PayResponse(BaseModel):
    transfer_id: str = Field(..., alias="transferId")
    status: str
    rail: str
    amount: float
    currency: str
    recipient: str
    executed_at: str = Field(..., alias="executedAt")
    meta: Optional[dict[str, Any]] = None

    model_config = {"populate_by_name": True}


class TransferStatusResponse(BaseModel):
    transfer_id: str = Field(..., alias="transferId")
    status: str
    rail: str
    amount: float
    currency: str
    recipient: str
    executed_at: str = Field(..., alias="executedAt")
    meta: Optional[dict[str, Any]] = None
    rail_status: Optional[dict[str, Any]] = Field(None, alias="railStatus")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Constraint enforcement helpers
# ---------------------------------------------------------------------------

def _enforce_constraints(
    envelope: dict[str, Any],
    recipient: str,
    amount: float,
) -> None:
    """
    Apply all SpendEnvelope guard rails.  Raises HTTPException on any violation.
    """
    # Recipient allowlist
    allowed = envelope.get("allowedRecipients", [])
    if recipient not in allowed:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Recipient '{recipient}' is not in the envelope allowlist. "
                f"Allowed: {allowed}"
            ),
        )

    # Amount ceiling
    max_amount = envelope.get("maxAmount", 0)
    if amount > max_amount:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Requested amount {amount} {envelope.get('currency')} "
                f"exceeds envelope maxAmount {max_amount} {envelope.get('currency')}"
            ),
        )

    # Temporal validity (already checked in verify_signed_envelope but re-check here
    # in case the record was fetched from store and time has since elapsed)
    now = int(time.time())
    if now < envelope.get("validFrom", 0):
        raise HTTPException(status_code=422, detail="Envelope not yet active")
    if now > envelope.get("validUntil", 0):
        raise HTTPException(status_code=422, detail="Envelope has expired")


def _check_nonce(nonce: str) -> None:
    """Block replay attacks by rejecting already-used nonces."""
    if nonce_store.exists(nonce):
        raise HTTPException(
            status_code=409,
            detail=f"Nonce '{nonce}' has already been used (replay attack blocked)",
        )
    nonce_store.put(nonce, True)


# ---------------------------------------------------------------------------
# Route: POST /v1/pay
# ---------------------------------------------------------------------------

@router.post("", response_model=PayResponse, status_code=201, summary="Execute payment")
async def pay(body: PayRequest) -> PayResponse:
    """
    Verify a PQ-signed SpendEnvelope, enforce all constraints, and route to
    the appropriate rail.

    Supports two modes:
    - **envelope_id**: reference an envelope already registered via /v1/envelopes/{id}/sign
    - **inline**: pass envelope_json + signature + dsaPublicKey directly (TypeScript SDK wire format)

    Constraints checked:
    - ML-DSA-65 signature valid
    - Temporal validity (valid_from ≤ now ≤ valid_until)
    - Recipient in allowed_recipients
    - Amount ≤ max_amount
    - Nonce not previously used (replay prevention)
    """
    # ------------------------------------------------------------------
    # Resolve envelope
    # ------------------------------------------------------------------
    if body.envelope_id is not None:
        # Mode A: pre-registered
        record = signed_envelope_store.get(body.envelope_id)
        if record is None:
            raise HTTPException(
                status_code=404,
                detail=f"Signed envelope '{body.envelope_id}' not found. "
                       "Use POST /v1/envelopes then POST /v1/envelopes/{id}/sign first.",
            )
        if not record.get("signed"):
            raise HTTPException(
                status_code=422,
                detail="Envelope has not been signed yet. POST /v1/envelopes/{id}/sign first.",
            )
        try:
            envelope = verify_signed_envelope(
                envelope_json=record["envelope_json"],
                signature_hex=record["signature"],
                dsa_public_key_hex=record["issuer_pubkey"],
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    elif (
        body.envelope_json is not None
        and body.signature is not None
        and body.dsa_public_key is not None
    ):
        # Mode B: inline (TypeScript SDK wire format)
        try:
            envelope = verify_signed_envelope(
                envelope_json=body.envelope_json,
                signature_hex=body.signature,
                dsa_public_key_hex=body.dsa_public_key,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    else:
        raise HTTPException(
            status_code=422,
            detail=(
                "Provide either 'envelope_id' (pre-registered) or "
                "'envelope_json' + 'signature' + 'dsaPublicKey' (inline mode)."
            ),
        )

    # ------------------------------------------------------------------
    # Guard rails
    # ------------------------------------------------------------------
    _enforce_constraints(envelope, body.recipient, body.amount)
    _check_nonce(envelope["nonce"])

    # ------------------------------------------------------------------
    # Rail routing
    # ------------------------------------------------------------------
    rail = envelope.get("rail") or "airwallex"

    if rail == "airwallex":
        result = await execute_payment(
            envelope=envelope,
            recipient=body.recipient,
            amount=body.amount,
            memo=body.memo,
        )
    else:
        raise HTTPException(
            status_code=501,
            detail=f"Rail '{rail}' is not yet implemented. Available: airwallex",
        )

    # ------------------------------------------------------------------
    # Store result
    # ------------------------------------------------------------------
    transfer_store.put(result["transfer_id"], {
        **result,
        "envelope": envelope,
        "stored_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })

    return PayResponse(
        transfer_id=result["transfer_id"],
        status=result["status"],
        rail=result["rail"],
        amount=result["amount"],
        currency=result["currency"],
        recipient=result["recipient"],
        executed_at=result["executed_at"],
        meta=result.get("meta"),
    )


# ---------------------------------------------------------------------------
# Route: GET /v1/pay/{transfer_id}
# ---------------------------------------------------------------------------

@router.get("/{transfer_id}", response_model=TransferStatusResponse, summary="Get transfer status")
async def get_pay_status(transfer_id: str) -> TransferStatusResponse:
    """
    Fetch the current status of a transfer.

    First checks the local store, then polls Airwallex for the latest status.
    """
    record = transfer_store.get(transfer_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=f"Transfer '{transfer_id}' not found",
        )

    # Poll the rail for current status
    rail = record.get("rail", "airwallex")
    rail_status: Optional[dict[str, Any]] = None
    if rail == "airwallex":
        try:
            rail_status = await get_transfer_status(transfer_id)
        except Exception as exc:
            rail_status = {"error": str(exc)}

    return TransferStatusResponse(
        transfer_id=record["transfer_id"],
        status=rail_status.get("status", record["status"]) if rail_status else record["status"],
        rail=record["rail"],
        amount=record["amount"],
        currency=record["currency"],
        recipient=record["recipient"],
        executed_at=record["executed_at"],
        meta=record.get("meta"),
        rail_status=rail_status,
    )
