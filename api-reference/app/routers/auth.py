"""
PQSafe API Reference — /v1/auth router.

POST /v1/auth/send-otp    — send SMS OTP to a phone number via Twilio Verify
POST /v1/auth/verify-otp  — check OTP code, return verified status

Uses Twilio Verify V2 (Service SID stored in settings).
No OTP is ever stored server-side — Twilio owns the state.
"""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.settings import settings

logger = logging.getLogger("pqsafe.auth")

router = APIRouter(prefix="/v1/auth", tags=["auth"])

# E.164 pattern — e.g. +85297128390
_E164_RE = re.compile(r"^\+[1-9]\d{6,14}$")


def _twilio_client():
    """Return a Twilio Client, or raise 503 if credentials are missing."""
    if not settings.twilio_auth_token:
        raise HTTPException(
            status_code=503,
            detail="SMS auth not configured — TWILIO_AUTH_TOKEN missing",
        )
    from twilio.rest import Client  # lazy import — only needed when SMS is used
    return Client(settings.twilio_account_sid, settings.twilio_auth_token)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SendOtpRequest(BaseModel):
    phone: str = Field(..., description="Recipient phone in E.164 format, e.g. +85297128390")
    channel: str = Field("sms", description="Delivery channel: sms | call | whatsapp")
    locale: str | None = Field(None, description="BCP-47 locale for OTP message language, e.g. zh, zh-TW, en. Defaults to Twilio service default (en).")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not _E164_RE.match(v):
            raise ValueError("Phone must be E.164 format, e.g. +85297128390")
        return v

    @field_validator("channel")
    @classmethod
    def validate_channel(cls, v: str) -> str:
        if v not in ("sms", "call", "whatsapp"):
            raise ValueError("channel must be sms, call, or whatsapp")
        return v


class SendOtpResponse(BaseModel):
    status: str = Field(..., description="Twilio verification status: pending | approved | canceled")
    to: str = Field(..., description="Destination number as returned by Twilio")
    channel: str


class VerifyOtpRequest(BaseModel):
    phone: str = Field(..., description="Same phone used in send-otp")
    code: str = Field(..., min_length=4, max_length=10, description="OTP code entered by user")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        if not _E164_RE.match(v):
            raise ValueError("Phone must be E.164 format, e.g. +85297128390")
        return v


class VerifyOtpResponse(BaseModel):
    verified: bool = Field(..., description="True if code matched and is not expired")
    status: str = Field(..., description="approved | pending | canceled | expired | failed")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/send-otp", response_model=SendOtpResponse, summary="Send SMS OTP")
async def send_otp(body: SendOtpRequest) -> SendOtpResponse:
    """
    Trigger a Twilio Verify OTP to the given phone number.

    Returns immediately once Twilio accepts the request.
    The OTP expires after 10 minutes (Twilio default).
    """
    client = _twilio_client()
    kwargs: dict = {"to": body.phone, "channel": body.channel}
    if body.locale:
        kwargs["locale"] = body.locale

    try:
        verification = client.verify.v2.services(
            settings.twilio_verify_service_sid
        ).verifications.create(**kwargs)
    except Exception as exc:
        logger.error("Twilio send-otp error for %s: %s", body.phone, exc)
        raise HTTPException(status_code=502, detail=f"Twilio error: {exc}") from exc

    logger.info("OTP sent to %s via %s — status=%s", body.phone, body.channel, verification.status)
    return SendOtpResponse(
        status=verification.status,
        to=verification.to,
        channel=body.channel,
    )


@router.post("/verify-otp", response_model=VerifyOtpResponse, summary="Verify OTP code")
async def verify_otp(body: VerifyOtpRequest) -> VerifyOtpResponse:
    """
    Check the OTP code entered by the user.

    Returns `verified: true` only when the code matches and is still within the
    10-minute window.  Twilio invalidates the code after first successful check.
    """
    client = _twilio_client()
    try:
        check = client.verify.v2.services(
            settings.twilio_verify_service_sid
        ).verification_checks.create(to=body.phone, code=body.code)
    except Exception as exc:
        logger.error("Twilio verify-otp error for %s: %s", body.phone, exc)
        raise HTTPException(status_code=502, detail=f"Twilio error: {exc}") from exc

    verified = check.status == "approved"
    logger.info("OTP check for %s — status=%s verified=%s", body.phone, check.status, verified)
    return VerifyOtpResponse(verified=verified, status=check.status)
