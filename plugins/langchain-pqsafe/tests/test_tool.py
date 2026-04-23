"""
Smoke tests for PQSafePaymentTool.

Run: pytest tests/
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from langchain_pqsafe.tool import PQSafePaymentTool


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
            envelope_json="not-json",
            recipient="GB29NWBK60161331926819",
            amount=100.0,
        )
        assert "Error" in result
        assert "valid JSON" in result

    @patch("langchain_pqsafe.tool.requests.post")
    def test_successful_payment_returns_tx_info(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "txId": "tx_abc123",
            "status": "settled",
            "rail": "wise",
        }
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        result = self.tool._run(
            envelope_json=VALID_ENVELOPE,
            recipient="GB29NWBK60161331926819",
            amount=50.0,
            memo="Invoice #42",
        )

        assert "tx_abc123" in result
        assert "settled" in result
        assert "wise" in result
        mock_post.assert_called_once()

    @patch("langchain_pqsafe.tool.requests.post")
    def test_http_error_returns_error_string(self, mock_post):
        import requests as req

        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.text = "Forbidden"
        http_err = req.HTTPError(response=mock_response)
        mock_response.raise_for_status.side_effect = http_err
        mock_post.return_value = mock_response

        result = self.tool._run(
            envelope_json=VALID_ENVELOPE,
            recipient="GB29NWBK60161331926819",
            amount=50.0,
        )

        assert "Payment failed" in result
