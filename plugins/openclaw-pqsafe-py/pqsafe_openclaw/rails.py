"""
pqsafe_openclaw.rails — Payment rail selection and metadata.

Mirrors the 5-rail architecture of the PQSafe AgentPay SDK. Each rail has
distinct address format requirements, currency constraints, and availability.

Rail constants match the ``pqsafe-agent-pay`` SDK ``Rail`` literal exactly
so they can be passed directly to ``pqsafe.pay()``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional

# ---------------------------------------------------------------------------
# Rail literal type (mirrors pqsafe-agent-pay SDK)
# ---------------------------------------------------------------------------

RailLiteral = Literal["airwallex", "wise", "stripe", "usdc-base", "x402"]


# ---------------------------------------------------------------------------
# Rail metadata
# ---------------------------------------------------------------------------

@dataclass
class RailInfo:
    """
    Metadata for a PQSafe payment rail.

    Attributes
    ----------
    rail_id : str
        Canonical rail identifier (matches pqsafe-agent-pay Rail literal).
    display_name : str
        Human-readable rail name.
    supported_currencies : list[str]
        ISO 4217 codes or crypto symbols this rail accepts.
    address_formats : list[str]
        Description of accepted recipient address formats.
    status : str
        "live-sandbox" | "mock" — reflects current SDK implementation state.
    latency_ms_p50 : int
        Typical transaction latency at p50 (milliseconds).
    notes : str
        Additional notes for developers.
    """
    rail_id: str
    display_name: str
    supported_currencies: List[str]
    address_formats: List[str]
    status: str
    latency_ms_p50: int
    notes: str = ""


RAILS: Dict[str, RailInfo] = {
    "airwallex": RailInfo(
        rail_id="airwallex",
        display_name="Airwallex",
        supported_currencies=["HKD", "USD", "EUR", "GBP", "AUD", "SGD", "CNY"],
        address_formats=["Airwallex beneficiary UUID", "SWIFT/BIC + account number"],
        status="live-sandbox",
        latency_ms_p50=3500,
        notes=(
            "5 live sandbox transfer UUIDs confirmed in PQSafe DEMO_RECEIPTS.md. "
            "Airwallex is a YC W17 company — warm intro path documented in "
            "memory/pqsafe_warm_intro_map_2026_04_26.md."
        ),
    ),
    "wise": RailInfo(
        rail_id="wise",
        display_name="Wise (Transferwise)",
        supported_currencies=["USD", "EUR", "GBP", "HKD", "AUD", "CAD", "JPY", "SGD"],
        address_formats=["IBAN", "UK sort code + account", "US ABA routing + account"],
        status="live-sandbox",
        latency_ms_p50=4200,
        notes=(
            "Auto-detects IBAN vs. sort-code vs. ABA routing number format. "
            "Live sandbox with Wise API v3."
        ),
    ),
    "stripe": RailInfo(
        rail_id="stripe",
        display_name="Stripe",
        supported_currencies=["USD", "EUR", "GBP", "HKD", "AUD", "CAD", "JPY", "SGD"],
        address_formats=["Stripe account ID (acct_xxx)", "Stripe invoice ID", "Stripe payment link URL"],
        status="mock",
        latency_ms_p50=1200,
        notes=(
            "Mock implementation covers invoice, PaymentIntent, and payment link flows. "
            "All guardrails (signature, allowlist, ceiling) run end-to-end in mock mode."
        ),
    ),
    "usdc-base": RailInfo(
        rail_id="usdc-base",
        display_name="USDC on Base (ERC-20)",
        supported_currencies=["USDC"],
        address_formats=["EVM address (0x-prefixed, 20 bytes)"],
        status="mock",
        latency_ms_p50=8000,
        notes=(
            "Produces ERC-20 calldata for USDC transfer on Base L2. "
            "Compatible with Coinbase CDP AgentKit and viem injection."
        ),
    ),
    "x402": RailInfo(
        rail_id="x402",
        display_name="x402 (HTTP 402 protocol)",
        supported_currencies=["USDC", "ETH"],
        address_formats=["HTTP URL (resource endpoint)", "EVM address (fallback)"],
        status="mock",
        latency_ms_p50=500,
        notes=(
            "HTTP 402 handshake per Coinbase x402 protocol spec. "
            "Agent presents SpendEnvelope as bearer credential in 402 response flow."
        ),
    ),
}


# ---------------------------------------------------------------------------
# Rail selection helpers
# ---------------------------------------------------------------------------

def select_rail(
    currency: str,
    recipient: str,
    preferred_rail: Optional[str] = None,
) -> RailInfo:
    """
    Select the most appropriate rail for a payment.

    Selection priority:
    1. Use ``preferred_rail`` if provided and it supports the currency.
    2. Prefer live-sandbox rails over mock rails.
    3. For USDC: prefer ``usdc-base``.
    4. For HTTP URLs: prefer ``x402``.
    5. Default: ``airwallex`` for fiat, ``usdc-base`` for crypto.

    Parameters
    ----------
    currency : str
        ISO 4217 currency code or crypto symbol (e.g. "HKD", "USDC").
    recipient : str
        Recipient address / URL (used for format detection).
    preferred_rail : str | None
        Caller preference. Validated against currency support.

    Returns
    -------
    RailInfo
        The selected rail metadata.

    Raises
    ------
    ValueError
        If no rail supports the requested currency.
    """
    currency = currency.upper()

    # Explicit preference
    if preferred_rail:
        rail = RAILS.get(preferred_rail)
        if rail is None:
            raise ValueError(
                f"select_rail: unknown rail '{preferred_rail}'. "
                f"Valid rails: {list(RAILS.keys())}"
            )
        if currency not in rail.supported_currencies:
            raise ValueError(
                f"select_rail: rail '{preferred_rail}' does not support currency '{currency}'. "
                f"Supported: {rail.supported_currencies}"
            )
        return rail

    # Auto-detection
    # x402: HTTP URL recipients
    if recipient.startswith("http://") or recipient.startswith("https://"):
        x402 = RAILS["x402"]
        if currency in x402.supported_currencies:
            return x402

    # USDC: prefer Base
    if currency == "USDC":
        return RAILS["usdc-base"]

    # Fiat: prefer live-sandbox rails
    fiat_preference = ["airwallex", "wise", "stripe"]
    for rail_id in fiat_preference:
        rail = RAILS[rail_id]
        if currency in rail.supported_currencies:
            return rail

    # Last resort: any rail that supports the currency
    for rail in RAILS.values():
        if currency in rail.supported_currencies:
            return rail

    raise ValueError(
        f"select_rail: no rail supports currency '{currency}'. "
        f"Supported currencies per rail: "
        + ", ".join(f"{r.rail_id}={r.supported_currencies}" for r in RAILS.values())
    )


def list_rails_for_currency(currency: str) -> List[RailInfo]:
    """Return all rails that support the given currency."""
    currency = currency.upper()
    return [r for r in RAILS.values() if currency in r.supported_currencies]
