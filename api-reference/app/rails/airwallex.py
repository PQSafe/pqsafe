"""
PQSafe API Reference — Airwallex rail adapter.

Mirrors the TypeScript SDK's src/rails/airwallex.ts, ported to Python with
httpx (async) instead of fetch.

Flow:
  1. OAuth2 client-credentials POST /authentication/login → bearer token (cached)
  2. POST /transfers/create with idempotency key = envelope_nonce + timestamp
  3. Map Airwallex response → TransferResult

Environment variables (via app.settings):
  AIRWALLEX_CLIENT_ID   — your Airwallex app client ID
  AIRWALLEX_API_KEY     — your Airwallex API key
  AIRWALLEX_MODE        — 'sandbox' (default) or 'prod'
  PQSAFE_MOCK_MODE      — set to '1' to skip real HTTP calls (auto when creds absent)

Docs: https://www.airwallex.com/docs/api
"""

from __future__ import annotations

import time
import uuid
from typing import Any

import httpx

from app.settings import settings


# ---------------------------------------------------------------------------
# Token cache (per-process, reused across requests)
# ---------------------------------------------------------------------------

_token_cache: dict[str, Any] = {"token": None, "expires_at": 0.0}


async def _get_access_token(client: httpx.AsyncClient) -> str:
    now = time.time()
    if _token_cache["token"] and _token_cache["expires_at"] > now + 30:
        return _token_cache["token"]

    resp = await client.post(
        f"{settings.airwallex_base_url}/authentication/login",
        headers={
            "Content-Type": "application/json",
            "x-client-id": settings.airwallex_client_id,
            "x-api-key": settings.airwallex_api_key,
        },
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"Airwallex auth failed ({resp.status_code}): {resp.text}"
        )

    data = resp.json()
    token: str = data["token"]
    expires_at: float = (
        time.mktime(time.strptime(data["expires_at"], "%Y-%m-%dT%H:%M:%S"))
        if "expires_at" in data
        else now + 30 * 60
    )
    _token_cache["token"] = token
    _token_cache["expires_at"] = expires_at
    return token


# ---------------------------------------------------------------------------
# Transfer execution
# ---------------------------------------------------------------------------

async def _create_transfer(
    client: httpx.AsyncClient,
    token: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    resp = await client.post(
        f"{settings.airwallex_base_url}/transfers/create",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
    )
    text = resp.text
    if resp.status_code not in (200, 201):
        if "insufficient_funds" in text:
            raise ValueError("INSUFFICIENT_FUNDS")
        if "beneficiary_not_found" in text:
            raise ValueError("INVALID_RECIPIENT")
        if "compliance_check_failed" in text:
            raise ValueError("COMPLIANCE_BLOCK")
        raise RuntimeError(
            f"Airwallex /transfers/create failed ({resp.status_code}): {text}"
        )
    return resp.json()


async def get_transfer_status(transfer_id: str) -> dict[str, Any]:
    """Poll Airwallex for the current status of a transfer."""
    if settings.mock_mode:
        return {
            "id": transfer_id,
            "status": "COMPLETED",
            "mock": True,
        }

    async with httpx.AsyncClient(timeout=30) as client:
        token = await _get_access_token(client)
        resp = await client.get(
            f"{settings.airwallex_base_url}/transfers/{transfer_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Public interface — called by pay router
# ---------------------------------------------------------------------------

async def execute_payment(
    envelope: dict[str, Any],
    recipient: str,
    amount: float,
    memo: str | None = None,
) -> dict[str, Any]:
    """
    Execute a payment on the Airwallex rail.

    Parameters
    ----------
    envelope   : parsed camelCase envelope dict (from verify_signed_envelope)
    recipient  : recipient identifier (bank account number, IBAN, etc.)
    amount     : amount to transfer (in envelope's currency)
    memo       : optional human-readable reference

    Returns a dict with: transfer_id, status, rail, amount, currency,
    recipient, executed_at, meta.
    """
    # ------------------------------------------------------------------
    # Mock path — no Airwallex creds or PQSAFE_MOCK_MODE=1
    # ------------------------------------------------------------------
    if settings.mock_mode:
        mock_id = f"awx_sbx_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        return {
            "transfer_id": mock_id,
            "status": "COMPLETED",
            "rail": "airwallex",
            "amount": amount,
            "currency": envelope["currency"],
            "recipient": recipient,
            "executed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "meta": {
                "mock": True,
                "env": settings.airwallex_mode,
                "agent": envelope.get("agent"),
                "issuer": envelope.get("issuer"),
                "envelope_nonce": envelope.get("nonce"),
                "memo": memo,
            },
        }

    # ------------------------------------------------------------------
    # Real path — hits live or sandbox Airwallex
    # ------------------------------------------------------------------
    request_id = f"{envelope['nonce']}-{int(time.time())}"
    body: dict[str, Any] = {
        "request_id": request_id,
        "source_currency": "USD",
        "transfer_currency": envelope["currency"],
        "transfer_amount": amount,
        "transfer_method": "SWIFT",
        "reason": "goods_purchase",
        "reference": memo or f"AgentPay/{envelope.get('agent', 'unknown')}",
        "beneficiary": {
            "type": "BANK_ACCOUNT",
            "entity_type": "COMPANY",
            "company_name": "PQSafe Beneficiary",
            "address": {
                "country_code": "US",
                "city": "San Francisco",
                "street_address": "1 Market St",
                "postcode": "94105",
            },
            "bank_details": {
                "account_name": "PQSafe Beneficiary",
                "account_number": recipient,
                "bank_country_code": "US",
                "swift_code": "CHASUS33",
                "bank_name": "JPMorgan Chase",
                "account_currency": envelope["currency"],
            },
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        token = await _get_access_token(client)
        transfer = await _create_transfer(client, token, body)

    return {
        "transfer_id": transfer["id"],
        "status": transfer.get("status", "PENDING"),
        "rail": "airwallex",
        "amount": amount,
        "currency": envelope["currency"],
        "recipient": recipient,
        "executed_at": transfer.get("created_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
        "meta": {
            "mock": False,
            "env": settings.airwallex_mode,
            "agent": envelope.get("agent"),
            "issuer": envelope.get("issuer"),
            "envelope_nonce": envelope.get("nonce"),
            "airwallex_status": transfer.get("status"),
            "airwallex_request_id": transfer.get("request_id"),
        },
    }
