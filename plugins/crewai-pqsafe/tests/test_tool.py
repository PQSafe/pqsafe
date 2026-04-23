"""
Smoke tests for CrewAI PQSafePaymentTool.

Run: pytest tests/
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from crewai_pqsafe.tool import PQSafePaymentTool


VALID_ENVELOPE = json.dumps({
    "envelopeJson": '{"version":1}',
    "signature": "deadbeef",
    "dsaPublicKey": "cafebabe",
})


class TestPQSafePaymentToolSmoke:
    def setup_method(self):
        self.tool = PQSafePaymentTool()

    def test_tool_metadata(self):
        assert self.tool.name == "pqsafe_pay"
        assert "pqsafe" in self.tool.description.lower()

    def test_invalid_envelope_json_returns_error_string(self):
        result = self.tool._run(
            envelope_json="not-valid-json",
            recipient="GB29NWBK60161331926819",
            amount=100.0,
        )
        assert "Error" in result
        assert "valid JSON" in result

    @patch("crewai_pqsafe.tool.requests.post")
    def test_successful_payment_returns_tx_info(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "txId": "tx_crew_456",
            "status": "settled",
            "rail": "airwallex",
        }
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = self.tool._run(
            envelope_json=VALID_ENVELOPE,
            recipient="GB29NWBK60161331926819",
            amount=150.0,
            memo="Supplier invoice #42",
        )

        assert "tx_crew_456" in result
        assert "settled" in result
        assert "airwallex" in result

    @patch("crewai_pqsafe.tool.requests.post")
    def test_http_error_returns_error_string(self, mock_post):
        import requests as req

        mock_response = MagicMock()
        mock_response.status_code = 422
        mock_response.text = "Unprocessable Entity"
        mock_response.raise_for_status.side_effect = req.HTTPError(response=mock_response)
        mock_post.return_value = mock_response

        result = self.tool._run(
            envelope_json=VALID_ENVELOPE,
            recipient="GB29NWBK60161331926819",
            amount=150.0,
        )

        assert "Payment failed" in result
        assert "422" in result
