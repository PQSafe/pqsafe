"""
PQSafe API Reference — configuration.

All settings are driven by environment variables.  Load a .env file locally;
in production use the host's secret manager / env injection.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ------------------------------------------------------------------
    # Server
    # ------------------------------------------------------------------
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "info"
    cors_origins: list[str] = ["*"]

    # ------------------------------------------------------------------
    # API auth
    # ------------------------------------------------------------------
    pqsafe_api_key: str = ""
    """
    Bearer token required on all write endpoints.
    Leave empty to disable auth (only for local dev / demo).
    """

    # ------------------------------------------------------------------
    # Airwallex
    # ------------------------------------------------------------------
    airwallex_client_id: str = ""
    airwallex_api_key: str = ""
    airwallex_mode: str = "sandbox"
    """
    'sandbox' → api-demo.airwallex.com
    'prod'    → api.airwallex.com
    """

    # ------------------------------------------------------------------
    # Twilio — SMS OTP via Verify V2
    # ------------------------------------------------------------------
    twilio_account_sid: str = "your_account_sid_here"
    twilio_auth_token: str = ""
    twilio_verify_service_sid: str = "your_verify_service_sid_here"

    # ------------------------------------------------------------------
    # Mock / testing
    # ------------------------------------------------------------------
    pqsafe_mock_mode: bool = False
    """
    When True, all rail connectors return a fake PaymentResult without
    hitting any external API.  Auto-enabled when Airwallex creds are absent.
    """

    @property
    def airwallex_base_url(self) -> str:
        if self.airwallex_mode == "prod":
            return "https://api.airwallex.com/api/v1"
        return "https://api-demo.airwallex.com/api/v1"

    @property
    def mock_mode(self) -> bool:
        """True when mock mode is forced OR when Airwallex creds are absent."""
        if self.pqsafe_mock_mode:
            return True
        return not (self.airwallex_client_id and self.airwallex_api_key)


# Singleton — import this everywhere
settings = Settings()
