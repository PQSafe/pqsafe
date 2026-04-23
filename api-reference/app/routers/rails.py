"""
PQSafe API Reference — /v1/rails router.

GET /v1/rails          — list available rails + supported currencies
GET /v1/rails/{rail}/quote — get rate + fee estimate before execution
"""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.settings import settings

router = APIRouter(prefix="/v1/rails", tags=["rails"])

# ---------------------------------------------------------------------------
# Static rail metadata — expand as connectors are implemented
# ---------------------------------------------------------------------------

RAIL_CATALOG: dict[str, dict[str, Any]] = {
    "airwallex": {
        "rail": "airwallex",
        "name": "Airwallex Global Transfers",
        "status": "live",
        "supported_currencies": ["USD", "HKD", "GBP", "EUR", "AUD", "SGD", "CNY"],
        "transfer_methods": ["SWIFT", "LOCAL"],
        "min_amount": 1.0,
        "docs": "https://www.airwallex.com/docs/api",
    },
    "wise": {
        "rail": "wise",
        "name": "Wise (TransferWise)",
        "status": "coming_soon",
        "supported_currencies": ["USD", "GBP", "EUR", "AUD", "CAD", "SGD"],
        "transfer_methods": ["LOCAL"],
        "min_amount": 1.0,
        "docs": "https://docs.wise.com",
    },
    "stripe": {
        "rail": "stripe",
        "name": "Stripe Treasury",
        "status": "coming_soon",
        "supported_currencies": ["USD"],
        "transfer_methods": ["ACH"],
        "min_amount": 0.5,
        "docs": "https://stripe.com/docs/treasury",
    },
    "usdc-base": {
        "rail": "usdc-base",
        "name": "USDC on Base (Coinbase)",
        "status": "coming_soon",
        "supported_currencies": ["USDC"],
        "transfer_methods": ["onchain"],
        "min_amount": 0.01,
        "docs": "https://docs.cdp.coinbase.com",
    },
    "x402": {
        "rail": "x402",
        "name": "HTTP 402 Micropayments",
        "status": "coming_soon",
        "supported_currencies": ["USDC"],
        "transfer_methods": ["micropayment"],
        "min_amount": 0.001,
        "docs": "https://x402.org",
    },
}


@router.get("", summary="List available rails")
async def list_rails() -> dict[str, Any]:
    """
    Return all rails the server knows about, with their status and supported
    currencies.  Only rails with status='live' will accept payments.
    """
    return {
        "rails": list(RAIL_CATALOG.values()),
        "default_rail": "airwallex",
    }


@router.get("/{rail}/quote", summary="Get rate + fee quote for a rail")
async def get_quote(
    rail: str,
    amount: float = Query(..., gt=0, description="Amount to transfer"),
    source_currency: str = Query("USD", description="Source currency (ISO 4217)"),
    target_currency: str = Query("USD", description="Target currency (ISO 4217)"),
) -> dict[str, Any]:
    """
    Return an indicative rate and fee estimate for a rail before executing a
    payment.  For Airwallex, hits the real quote API in sandbox mode.
    """
    if rail not in RAIL_CATALOG:
        raise HTTPException(
            status_code=404,
            detail=f"Rail '{rail}' not found. Available: {list(RAIL_CATALOG.keys())}",
        )

    if RAIL_CATALOG[rail]["status"] != "live":
        return {
            "rail": rail,
            "status": "coming_soon",
            "note": f"Rail '{rail}' is not yet implemented.",
            "indicative_fee_pct": None,
            "indicative_rate": None,
        }

    # Airwallex live quote
    if rail == "airwallex":
        return await _airwallex_quote(amount, source_currency, target_currency)

    raise HTTPException(status_code=501, detail=f"Quote not implemented for rail '{rail}'")


async def _airwallex_quote(
    amount: float,
    source_currency: str,
    target_currency: str,
) -> dict[str, Any]:
    """Fetch a real quote from Airwallex (sandbox or prod)."""
    if settings.mock_mode:
        return {
            "rail": "airwallex",
            "source_currency": source_currency,
            "target_currency": target_currency,
            "source_amount": amount,
            "target_amount": round(amount * 0.98, 2),
            "fee": round(amount * 0.015, 2),
            "rate": 0.98,
            "indicative": True,
            "mock": True,
        }

    # Real Airwallex FX quote
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{settings.airwallex_base_url}/rates/quote",
                params={
                    "sell_currency": source_currency,
                    "buy_currency": target_currency,
                    "sell_amount": amount,
                    "lock_side": "sell",
                },
                headers={
                    "x-client-id": settings.airwallex_client_id,
                    "x-api-key": settings.airwallex_api_key,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "rail": "airwallex",
                "source_currency": source_currency,
                "target_currency": target_currency,
                "source_amount": amount,
                "target_amount": data.get("client_buy_amount"),
                "rate": data.get("client_rate"),
                "fee": data.get("fee_amount"),
                "indicative": False,
                "mock": False,
            }
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Airwallex quote failed: {exc}") from exc
