"""
PQSafe API Reference — Minds adapter router.

POST /api/minds/authorize-spend — one-call demo decision for Minds tools.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from typing import Any, Literal, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import AliasChoices, BaseModel, Field, field_validator

from app.crypto.envelope import (
    active_backend,
    envelope_to_canonical_bytes,
    generate_keypair,
    sign_bytes,
    verify_signed_envelope,
)
from app.routers.envelopes import RAIL_VALUES
from app.routers.pay import _check_nonce, _enforce_constraints
from app.settings import settings

router = APIRouter(prefix="/api/minds", tags=["minds"])

Decision = Literal[
    "approved",
    "blocked_policy",
    "blocked_tamper",
    "needs_human_approval",
    "error",
]


def _load_adapter_keypair() -> tuple[bytes, bytes]:
    if settings.minds_adapter_public_key_hex and settings.minds_adapter_secret_key_hex:
        return (
            bytes.fromhex(settings.minds_adapter_public_key_hex),
            bytes.fromhex(settings.minds_adapter_secret_key_hex),
        )
    return generate_keypair()


_ADAPTER_PUBLIC_KEY, _ADAPTER_SECRET_KEY = _load_adapter_keypair()
_ADAPTER_ADDRESS = "pq1" + hashlib.sha256(_ADAPTER_PUBLIC_KEY).hexdigest()[:40]


def _new_nonce() -> str:
    return os.urandom(16).hex()


def _iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _hash_json(value: dict[str, Any]) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


class MindsPolicy(BaseModel):
    whitelist: list[str] = Field(..., min_length=1)
    per_tx_limit: float = Field(
        ...,
        gt=0,
        validation_alias=AliasChoices("single_payment_limit", "per_tx_limit"),
    )
    human_approval_threshold: float = Field(75.0, ge=0)
    require_memo: bool = False
    valid_secs: int = Field(3600, gt=0)

    model_config = {"populate_by_name": True}


class AuthorizeSpendRequest(BaseModel):
    mind_id: str = Field(..., min_length=1)
    agent_id: str = Field(..., min_length=1)
    merchant: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    currency: str = Field(..., min_length=3, max_length=10)  # token symbols (USDC/USDT), not just 3-char ISO fiat
    memo: Optional[str] = None
    policy: MindsPolicy
    rail: Optional[str] = None
    human_approved: bool = False
    # Demo-only: lets the UI's tamper beat alter the signed amount post-signing.
    # Accepts the wire key `_tamper_amount` (UI) and `tamper_amount`.
    tamper_amount: Optional[float] = Field(
        None, validation_alias=AliasChoices("_tamper_amount", "tamper_amount")
    )

    model_config = {"populate_by_name": True}

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, v: str) -> str:
        return v.upper()

    @field_validator("rail")
    @classmethod
    def validate_rail(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in RAIL_VALUES:
            raise ValueError(f"rail must be one of {sorted(RAIL_VALUES)}")
        return v


class WalletAction(BaseModel):
    allowed_to_continue: bool
    settlement: Literal["mock", "none"]


class AuditBlock(BaseModel):
    envelope_id: str
    canonical_hash: str
    policy_hash: str
    crypto_backend: str
    signature_alg: str
    nonce: str
    verified_at: str


class AuthorizeSpendResponse(BaseModel):
    decision: Decision
    reason_code: str
    reason: str
    wallet_action: WalletAction
    audit: AuditBlock


def _response(
    *,
    decision: Decision,
    reason_code: str,
    reason: str,
    allowed: bool,
    envelope_id: str,
    canonical_hash: str,
    policy_hash: str,
    nonce: str,
) -> AuthorizeSpendResponse:
    return AuthorizeSpendResponse(
        decision=decision,
        reason_code=reason_code,
        reason=reason,
        wallet_action=WalletAction(
            allowed_to_continue=allowed,
            settlement="mock" if allowed else "none",
        ),
        audit=AuditBlock(
            envelope_id=envelope_id,
            canonical_hash=canonical_hash,
            policy_hash=policy_hash,
            crypto_backend=active_backend(),
            signature_alg="ML-DSA-65",
            nonce=nonce,
            verified_at=_iso_now(),
        ),
    )


def _require_bearer_auth(authorization: str | None) -> None:
    if not settings.pqsafe_api_key:
        return
    expected = f"Bearer {settings.pqsafe_api_key}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing bearer token")


@router.post("/authorize-spend", response_model=AuthorizeSpendResponse, summary="Authorize Minds spend")
async def authorize_spend(
    body: AuthorizeSpendRequest,
    authorization: str | None = Header(default=None),
) -> AuthorizeSpendResponse:
    """
    Build, sign, verify, and evaluate a PQSafe SpendEnvelope without moving funds.
    """
    _require_bearer_auth(authorization)

    envelope_id = str(uuid.uuid4())
    nonce = ""
    canonical_hash = ""
    policy_hash = _hash_json(body.policy.model_dump())

    try:
        now = int(time.time())
        nonce = _new_nonce()
        envelope: dict[str, Any] = {
            "version": 1,
            "issuer": _ADAPTER_ADDRESS,
            "agent": body.agent_id,
            "maxAmount": body.policy.per_tx_limit,
            "currency": body.currency,
            "allowedRecipients": body.policy.whitelist,
            "validFrom": now,
            "validUntil": now + body.policy.valid_secs,
            "nonce": nonce,
        }
        if body.rail is not None:
            envelope["rail"] = body.rail

        canonical_bytes = envelope_to_canonical_bytes(envelope)
        canonical_hash = hashlib.sha256(canonical_bytes).hexdigest()
        envelope_json = canonical_bytes.decode("utf-8")
        signature_hex = sign_bytes(canonical_bytes, _ADAPTER_SECRET_KEY).hex()

        verify_json = envelope_json
        if body.tamper_amount is not None:
            tampered = {**envelope, "maxAmount": body.tamper_amount}
            verify_json = envelope_to_canonical_bytes(tampered).decode("utf-8")

        try:
            verified_envelope = verify_signed_envelope(
                envelope_json=verify_json,
                signature_hex=signature_hex,
                dsa_public_key_hex=_ADAPTER_PUBLIC_KEY.hex(),
                skip_temporal=True,
            )
        except ValueError:
            return _response(
                decision="blocked_tamper",
                reason_code="SIGNATURE_INVALID",
                reason="Envelope signature or canonical hash verification failed.",
                allowed=False,
                envelope_id=envelope_id,
                canonical_hash=canonical_hash,
                policy_hash=policy_hash,
                nonce=nonce,
            )

        try:
            _enforce_constraints(verified_envelope, body.merchant, body.amount)
        except HTTPException as exc:
            detail = str(getattr(exc, "detail", exc)).lower()
            if "allowlist" in detail:
                reason_code = "RECIPIENT_NOT_WHITELISTED"
                reason = "Merchant is not in the policy whitelist."
            elif "exceeds" in detail or "maxamount" in detail:
                reason_code = "AMOUNT_OVER_LIMIT"
                reason = "Requested amount exceeds the per-transaction limit."
            elif "not yet active" in detail:
                reason_code = "NOT_YET_ACTIVE"
                reason = "Envelope is not yet active."
            elif "expired" in detail:
                reason_code = "ENVELOPE_EXPIRED"
                reason = "Envelope has expired."
            else:
                raise
            return _response(
                decision="blocked_policy",
                reason_code=reason_code,
                reason=reason,
                allowed=False,
                envelope_id=envelope_id,
                canonical_hash=canonical_hash,
                policy_hash=policy_hash,
                nonce=nonce,
            )

        if body.policy.require_memo and not (body.memo and body.memo.strip()):
            return _response(
                decision="blocked_policy",
                reason_code="MEMO_REQUIRED",
                reason="Policy requires a memo for this spend.",
                allowed=False,
                envelope_id=envelope_id,
                canonical_hash=canonical_hash,
                policy_hash=policy_hash,
                nonce=nonce,
            )

        try:
            _check_nonce(verified_envelope["nonce"])
        except HTTPException:
            return _response(
                decision="blocked_tamper",
                reason_code="REPLAY_NONCE",
                reason="Nonce has already been used.",
                allowed=False,
                envelope_id=envelope_id,
                canonical_hash=canonical_hash,
                policy_hash=policy_hash,
                nonce=nonce,
            )

        if body.amount > body.policy.human_approval_threshold and not body.human_approved:
            return _response(
                decision="needs_human_approval",
                reason_code="NEEDS_HUMAN_APPROVAL",
                reason="Human approval is required above the policy threshold.",
                allowed=False,
                envelope_id=envelope_id,
                canonical_hash=canonical_hash,
                policy_hash=policy_hash,
                nonce=nonce,
            )

        return _response(
            decision="approved",
            reason_code="OK",
            reason="Spend is authorized by signature, policy, validity, and replay checks.",
            allowed=True,
            envelope_id=envelope_id,
            canonical_hash=canonical_hash,
            policy_hash=policy_hash,
            nonce=nonce,
        )
    except Exception:
        return _response(
            decision="error",
            reason_code="UPSTREAM_UNREACHABLE",
            reason="Verifier path was unreachable; spend authorization failed closed.",
            allowed=False,
            envelope_id=envelope_id,
            canonical_hash=canonical_hash or "0" * 64,
            policy_hash=policy_hash,
            nonce=nonce,
        )
