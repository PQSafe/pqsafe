"""
PQSafe AgentPay — adapter package.

Provides AP2 (Agentic Payments Protocol v0.3.0) and Stripe ACP
(Agent Commerce Protocol) adapters for converting between protocol-native
mandate/token structures and PQSafe SpendEnvelopes.
"""

from __future__ import annotations

from .ap2 import (
    # Models
    PaymentItem,
    PaymentMethodData,
    ContactAddress,
    IntentMandate,
    CartMandate,
    PaymentMandate,
    # Functions
    ap2_mandate_to_spend_envelope,
    spend_envelope_to_ap2_mandate,
    verify_ap2_with_pq_wrapper,
)
from .acp import (
    # Models
    SharedPaymentTokenUsageLimits,
    SharedPaymentToken,
    CreateSharedPaymentTokenParams,
    # Functions
    acp_token_to_spend_envelope,
    spend_envelope_to_acp_token,
)

__all__ = [
    # AP2 models
    "PaymentItem",
    "PaymentMethodData",
    "ContactAddress",
    "IntentMandate",
    "CartMandate",
    "PaymentMandate",
    # AP2 functions
    "ap2_mandate_to_spend_envelope",
    "spend_envelope_to_ap2_mandate",
    "verify_ap2_with_pq_wrapper",
    # ACP models
    "SharedPaymentTokenUsageLimits",
    "SharedPaymentToken",
    "CreateSharedPaymentTokenParams",
    # ACP functions
    "acp_token_to_spend_envelope",
    "spend_envelope_to_acp_token",
]
