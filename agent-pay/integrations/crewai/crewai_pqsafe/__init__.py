"""
crewai_pqsafe — CrewAI integration for PQSafe AgentPay.

Post-quantum safe payments for AI crews.

Usage:
    from crewai_pqsafe import PQSafePaymentTool

    tool = PQSafePaymentTool()
    # or with mock mode:
    tool = PQSafePaymentTool(mock_mode=True)
"""

from .pqsafe_payment_tool import PQSafePaymentTool, PQSafePaymentInput

__all__ = ["PQSafePaymentTool", "PQSafePaymentInput"]
__version__ = "0.1.0"
