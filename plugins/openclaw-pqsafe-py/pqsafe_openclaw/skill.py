"""
pqsafe_openclaw.skill — Main OpenClaw skill entry point.

This module implements the four primary actions exposed by the PQSafe OpenClaw
skill. Each action returns an OpenClaw-compatible JSON-serializable dict that
the ClawHub runtime (or the TypeScript bridge skill) can relay to callers.

OpenClaw skill interface
------------------------
OpenClaw v1.x natively supports TypeScript skills. Python skills run as a
subprocess bridge: the TS wrapper calls ``python -m pqsafe_openclaw <action>
<json-args>`` and reads the JSON result from stdout. This module can also be
used directly in Python agent frameworks (LangChain, CrewAI, AutoGen).

Actions
-------
``pay``
    Build a SpendEnvelope, sign it (ML-DSA-65), verify recipient/amount
    constraints, and submit (or mock-submit) the payment via pqsafe-agent-pay.

``set_envelope``
    Pre-build and sign a SpendEnvelope to be passed to later ``pay`` calls.
    Useful when the issuer must authorize an envelope once and reuse it.

``query``
    Query the PQSafe API for a transaction status by tx_id.

``verify_received``
    Verify that an inbound dual-signed AP2 mandate is authentic (ML-DSA-65
    signature valid, not expired, recipient is in the allowlist).

OpenClaw-compatible JSON format
-------------------------------
Every action returns a dict with at minimum:
    {
        "ok": true | false,
        "action": "<action name>",
        "result": { ... }   # on success
        "error": "..."      # on failure
    }

This format is compatible with the OpenClaw SKILL.md response contract and
can be relay-printed to stdout for the TS bridge to parse.

CLI usage
---------
    python -m pqsafe_openclaw pay '{"issuer":"pq1aaa...","agent":"my-agent","recipient":"...","amount":10.0,"currency":"HKD"}'
    python -m pqsafe_openclaw verify_received '{"envelope":{...},"mldsa_public_key_hex":"..."}'
"""

from __future__ import annotations

import json
import os
import secrets
import time
from typing import Any, Dict, List, Optional, Union

from .cn_compliance import assert_not_cn_deployment
from .envelope import (
    AP2Mandate,
    DualSignedEnvelope,
    ECDSAKeyPair,
    MLDSAKeyPair,
    build_ap2_envelope,
    generate_ecdsa_keypair,
    generate_mldsa_keypair,
    verify_ap2_envelope,
)
from .rails import RailInfo, select_rail

# ---------------------------------------------------------------------------
# Dependency: pqsafe-agent-pay SDK
# ---------------------------------------------------------------------------

try:
    from pqsafe import (  # type: ignore[import]
        KeyPair as PQKeyPair,
        SignedEnvelope,
        SpendEnvelope,
        create_envelope,
        generate_keypair,
        pay as _pqsafe_pay,
        sign_envelope,
        verify_envelope,
    )
    _SDK_AVAILABLE = True
except ImportError:
    _SDK_AVAILABLE = False


# ---------------------------------------------------------------------------
# Result container
# ---------------------------------------------------------------------------

class SkillResult:
    """
    OpenClaw-compatible skill action result.

    Serializes to a JSON dict with ``ok``, ``action``, and ``result`` or
    ``error`` fields. This is the wire format for the OpenClaw TS bridge.
    """

    def __init__(
        self,
        action: str,
        ok: bool,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        self.action = action
        self.ok = ok
        self.result = result or {}
        self.error = error

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"ok": self.ok, "action": self.action}
        if self.ok:
            d["result"] = self.result
        else:
            d["error"] = self.error or "unknown error"
        return d

    def to_json(self, indent: Optional[int] = None) -> str:
        return json.dumps(self.to_dict(), indent=indent)

    def __repr__(self) -> str:
        return f"SkillResult(ok={self.ok}, action={self.action!r})"


# ---------------------------------------------------------------------------
# Main skill class
# ---------------------------------------------------------------------------

class PQSafeSkill:
    """
    PQSafe AgentPay — OpenClaw skill.

    Wraps the ``pqsafe-agent-pay`` Python SDK and exposes four actions:
    pay / set_envelope / query / verify_received.

    The skill can operate in two modes:
    - ``mock_mode=True`` (default): All guardrails run, but no HTTP call is
      made to api.pqsafe.xyz. Returns a realistic mock PaymentResult.
    - ``mock_mode=False``: Requires ``PQSAFE_API_KEY`` env var or explicit
      ``api_key``. Submits the real payment to api.pqsafe.xyz.

    Parameters
    ----------
    api_key : str | None
        PQSafe API key. Falls back to PQSAFE_API_KEY env var.
    mock_mode : bool | None
        If True, skip HTTP and return mock results (default: True unless
        PQSAFE_MOCK_MODE=0 is set).
    base_url : str
        PQSafe API base URL (default: https://api.pqsafe.xyz).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        mock_mode: Optional[bool] = None,
        base_url: str = "https://api.pqsafe.xyz",
    ) -> None:
        self.api_key = api_key or os.environ.get("PQSAFE_API_KEY")
        self.base_url = base_url
        if mock_mode is not None:
            self._mock_mode = mock_mode
        else:
            # Default: mock unless PQSAFE_MOCK_MODE=0 explicitly
            env_mock = os.environ.get("PQSAFE_MOCK_MODE", "1")
            self._mock_mode = env_mock != "0"

        if not _SDK_AVAILABLE:
            import warnings
            warnings.warn(
                "pqsafe_openclaw: pqsafe-agent-pay SDK not found. "
                "Install with: pip install pqsafe-agent-pay>=0.1.0. "
                "The skill will raise on pay() / set_envelope() calls.",
                ImportWarning,
                stacklevel=2,
            )

    # -----------------------------------------------------------------------
    # Action: pay
    # -----------------------------------------------------------------------

    def pay(
        self,
        issuer: str,
        agent: str,
        recipient: str,
        amount: float,
        currency: str,
        allowed_recipients: Optional[List[str]] = None,
        rail: Optional[str] = None,
        ttl_seconds: int = 3600,
        memo: Optional[str] = None,
        keypair: Optional[Any] = None,
    ) -> SkillResult:
        """
        Build a SpendEnvelope, sign it, and submit a payment.

        This is the primary action. It performs the full pipeline:
        1. Create a SpendEnvelope (via pqsafe-agent-pay SDK).
        2. Sign with ML-DSA-65 (or Ed25519 fallback if pqcrypto unavailable).
        3. Verify recipient allowlist + amount ceiling.
        4. Submit to PQSafe API (or return mock result).

        Parameters
        ----------
        issuer : str
            PQSafe address of the issuing wallet (pq1 + 40 hex chars).
        agent : str
            Agent identifier string (1-128 chars).
        recipient : str
            Recipient address in rail-specific format.
        amount : float
            Payment amount (positive, must not exceed envelope max_amount).
        currency : str
            ISO 4217 code or crypto symbol (e.g. "HKD", "USDC").
        allowed_recipients : list[str] | None
            Explicit allowlist. Defaults to [recipient] if not provided.
        rail : str | None
            Payment rail override. Auto-selected if not provided.
        ttl_seconds : int
            Envelope validity window (default: 3600 = 1 hour).
        memo : str | None
            Optional human-readable memo.
        keypair : KeyPair | None
            Pre-generated keypair. A fresh one is generated if not provided.

        Returns
        -------
        SkillResult
            OpenClaw-compatible result dict with tx_id, status, rail fields.
        """
        assert_not_cn_deployment()

        if not _SDK_AVAILABLE:
            return SkillResult(
                action="pay",
                ok=False,
                error="pqsafe-agent-pay SDK not installed. Run: pip install pqsafe-agent-pay>=0.1.0",
            )

        try:
            # Resolve recipients allowlist
            recipients = allowed_recipients or [recipient]

            # Auto-select rail if not specified
            rail_info = select_rail(currency=currency, recipient=recipient, preferred_rail=rail)

            # Generate keypair if not provided
            kp = keypair or generate_keypair()

            # Build envelope (max_amount = amount so single-payment envelopes are tight)
            envelope = create_envelope(
                issuer=issuer,
                agent=agent,
                max_amount=amount,
                currency=currency,
                allowed_recipients=recipients,
                ttl_seconds=ttl_seconds,
                rail=rail_info.rail_id,
            )

            # Sign
            signed = sign_envelope(envelope, kp)

            # Pay (or mock)
            result = _pqsafe_pay(
                signed,
                recipient=recipient,
                amount=amount,
                memo=memo,
                api_key=self.api_key,
                base_url=self.base_url,
                mock_mode=self._mock_mode,
            )

            return SkillResult(
                action="pay",
                ok=True,
                result={
                    "tx_id": result.tx_id,
                    "status": result.status,
                    "rail": result.rail,
                    "amount": amount,
                    "currency": currency,
                    "recipient": recipient,
                    "memo": memo,
                    "mock_mode": self._mock_mode,
                    "pq_backend": kp.backend,
                },
            )

        except Exception as exc:
            return SkillResult(action="pay", ok=False, error=str(exc))

    # -----------------------------------------------------------------------
    # Action: set_envelope
    # -----------------------------------------------------------------------

    def set_envelope(
        self,
        issuer: str,
        agent: str,
        max_amount: float,
        currency: str,
        allowed_recipients: List[str],
        rail: Optional[str] = None,
        ttl_seconds: int = 3600,
        keypair: Optional[Any] = None,
    ) -> SkillResult:
        """
        Pre-build and sign a SpendEnvelope for later use.

        Returns the signed envelope JSON so it can be stored and reused for
        multiple ``pay`` calls without re-signing. This is the multi-payment
        pattern: authorize once, spend many times within the cap.

        Parameters
        ----------
        issuer : str
            PQSafe address of the issuing wallet.
        agent : str
            Agent identifier string.
        max_amount : float
            Maximum total spend allowed by the envelope.
        currency : str
            ISO 4217 code or crypto symbol.
        allowed_recipients : list[str]
            Allowlist of recipient addresses.
        rail : str | None
            Optional rail constraint.
        ttl_seconds : int
            Envelope validity window in seconds.
        keypair : KeyPair | None
            Pre-generated keypair. Fresh one generated if not provided.

        Returns
        -------
        SkillResult
            Result dict with ``envelope_json``, ``signature``, ``dsa_public_key``
            fields matching the SignedEnvelope wire format.
        """
        assert_not_cn_deployment()

        if not _SDK_AVAILABLE:
            return SkillResult(
                action="set_envelope",
                ok=False,
                error="pqsafe-agent-pay SDK not installed. Run: pip install pqsafe-agent-pay>=0.1.0",
            )

        try:
            kp = keypair or generate_keypair()

            envelope = create_envelope(
                issuer=issuer,
                agent=agent,
                max_amount=max_amount,
                currency=currency,
                allowed_recipients=allowed_recipients,
                ttl_seconds=ttl_seconds,
                rail=rail,
            )

            signed = sign_envelope(envelope, kp)

            return SkillResult(
                action="set_envelope",
                ok=True,
                result={
                    "envelope_json": signed.envelope_json,
                    "signature": signed.signature,
                    "dsa_public_key": signed.dsa_public_key,
                    "issuer": issuer,
                    "agent": agent,
                    "max_amount": max_amount,
                    "currency": currency,
                    "allowed_recipients": allowed_recipients,
                    "pq_backend": kp.backend,
                    "expires_in_seconds": ttl_seconds,
                },
            )

        except Exception as exc:
            return SkillResult(action="set_envelope", ok=False, error=str(exc))

    # -----------------------------------------------------------------------
    # Action: query
    # -----------------------------------------------------------------------

    def query(self, tx_id: str) -> SkillResult:
        """
        Query the PQSafe API for a transaction status.

        In mock mode, returns a synthetic confirmed status. In live mode,
        calls GET /v1/tx/{tx_id} on the PQSafe API.

        Parameters
        ----------
        tx_id : str
            Transaction ID returned by a previous ``pay`` call.

        Returns
        -------
        SkillResult
            Result dict with ``tx_id``, ``status``, ``rail`` fields.
        """
        if self._mock_mode:
            # Mock: infer rail from tx_id prefix
            prefix_map = {
                "awx_sbx": "airwallex",
                "wise_sbx": "wise",
                "base_sbx": "usdc-base",
                "pi_sbx": "stripe",
                "x402_sbx": "x402",
            }
            rail = "unknown"
            for prefix, rail_id in prefix_map.items():
                if tx_id.startswith(prefix):
                    rail = rail_id
                    break

            return SkillResult(
                action="query",
                ok=True,
                result={
                    "tx_id": tx_id,
                    "status": "mock_confirmed",
                    "rail": rail,
                    "mock_mode": True,
                },
            )

        # Live mode: would call GET /v1/tx/{tx_id}
        # This is a stub for the live implementation — the PQSafe API endpoint
        # is documented at api.pqsafe.xyz/docs#/transactions/get_tx
        return SkillResult(
            action="query",
            ok=False,
            error=(
                "query: live API query not yet implemented in pqsafe-openclaw v0.1. "
                "Use mock_mode=True or query api.pqsafe.xyz/docs directly."
            ),
        )

    # -----------------------------------------------------------------------
    # Action: verify_received
    # -----------------------------------------------------------------------

    def verify_received(
        self,
        envelope: Dict[str, Any],
        mldsa_public_key_hex: str,
        expected_recipient: Optional[str] = None,
        ecdsa_public_key_compressed_hex: Optional[str] = None,
    ) -> SkillResult:
        """
        Verify an inbound dual-signed AP2 mandate is authentic.

        This action is called by the RECEIVER of an agent payment to confirm:
        1. The ML-DSA-65 signature is valid.
        2. Optionally, the ECDSA-P256 signature is valid.
        3. Optionally, the expected recipient is present in the mandate.

        Parameters
        ----------
        envelope : dict
            The full signed envelope dict (from the payer's AP2 mandate).
        mldsa_public_key_hex : str
            ML-DSA-65 public key hex of the expected signer.
        expected_recipient : str | None
            If provided, checks that this recipient appears in the mandate.
        ecdsa_public_key_compressed_hex : str | None
            If provided, also verifies the ECDSA-P256 signature.

        Returns
        -------
        SkillResult
            Result dict with ``valid``, ``alg``, ``pubkey_fingerprint`` fields.
        """
        try:
            mldsa_pub_bytes = bytes.fromhex(mldsa_public_key_hex)
        except ValueError as exc:
            return SkillResult(
                action="verify_received",
                ok=False,
                error=f"verify_received: invalid mldsa_public_key_hex — {exc}",
            )

        try:
            valid = verify_ap2_envelope(
                envelope_dict=envelope,
                mldsa_public_key=mldsa_pub_bytes,
                ecdsa_public_key_compressed_hex=ecdsa_public_key_compressed_hex,
            )
        except Exception as exc:
            return SkillResult(action="verify_received", ok=False, error=str(exc))

        # Optional recipient check
        if expected_recipient:
            recipient = envelope.get("recipient") or ""
            payee_constraints = envelope.get("payee_constraints") or []
            payee_ids = [p.get("payee_id", "") for p in payee_constraints]
            if expected_recipient != recipient and expected_recipient not in payee_ids:
                return SkillResult(
                    action="verify_received",
                    ok=False,
                    error=(
                        f"verify_received: expected_recipient '{expected_recipient}' "
                        f"not found in mandate (recipient='{recipient}', "
                        f"payee_constraints={payee_ids})"
                    ),
                )

        sig_block = envelope.get("signature", {})
        return SkillResult(
            action="verify_received",
            ok=True,
            result={
                "valid": True,
                "alg": sig_block.get("alg"),
                "pubkey_fingerprint": sig_block.get("pubkey_fingerprint"),
                "ecdsa_verified": ecdsa_public_key_compressed_hex is not None,
                "mldsa_verified": True,
                "recipient_check": expected_recipient is not None,
            },
        )


# ---------------------------------------------------------------------------
# CLI entry point (for OpenClaw TypeScript bridge)
# ---------------------------------------------------------------------------

def _cli_main() -> None:
    """
    CLI entry point for the OpenClaw TypeScript bridge.

    Usage:
        python -m pqsafe_openclaw <action> <json-args>

    Prints a JSON result to stdout. Exits 0 on success, 1 on error.
    """
    import sys

    if len(sys.argv) < 3:
        result = {
            "ok": False,
            "action": "cli",
            "error": (
                "Usage: python -m pqsafe_openclaw <action> <json-args>\n"
                "Actions: pay | set_envelope | query | verify_received"
            ),
        }
        print(json.dumps(result))
        sys.exit(1)

    action = sys.argv[1]
    try:
        args = json.loads(sys.argv[2])
    except json.JSONDecodeError as exc:
        result = {"ok": False, "action": action, "error": f"Invalid JSON args: {exc}"}
        print(json.dumps(result))
        sys.exit(1)

    skill = PQSafeSkill()

    if action == "pay":
        skill_result = skill.pay(**args)
    elif action == "set_envelope":
        skill_result = skill.set_envelope(**args)
    elif action == "query":
        skill_result = skill.query(**args)
    elif action == "verify_received":
        skill_result = skill.verify_received(**args)
    else:
        skill_result = SkillResult(
            action=action,
            ok=False,
            error=f"Unknown action '{action}'. Valid: pay | set_envelope | query | verify_received",
        )

    print(skill_result.to_json())
    sys.exit(0 if skill_result.ok else 1)
