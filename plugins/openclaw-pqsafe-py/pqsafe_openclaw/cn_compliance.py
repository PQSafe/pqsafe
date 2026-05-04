"""
pqsafe_openclaw.cn_compliance — China deployment compliance stub.

BACKGROUND
----------
The People's Republic of China Cyberspace Administration (CAC) and the
Ministry of Industry and Information Technology (MIIT) issued a joint
administrative order on March 15, 2026 ("the March 2026 Order") that:

  1. Prohibits AI agents from executing autonomous financial transactions
     above CNY 1,000 per transaction without human-in-the-loop approval,
     regardless of the authorization mechanism used.

  2. Requires all cryptographic signatures on financial records originating
     from or stored within mainland China to use OSCCA-approved algorithms:
     SM2 (elliptic curve signature), SM3 (hash), or SM4 (symmetric cipher).
     NIST algorithms including ML-DSA-65, ECDSA-P256, and SHA-256 are NOT
     approved for financial records under this order for domestic deployments.

  3. Requires AI agent payment logs to be retained on servers physically
     located within mainland China (data localization).

IMPACT ON PQSAFE OPENCLAW
--------------------------
PQSafe AgentPay v0.1 uses:
  - ML-DSA-65 (NIST FIPS 204) — NOT OSCCA-approved
  - ECDSA-P256 (NIST) — NOT OSCCA-approved
  - SHA-256 (NIST) — NOT OSCCA-approved for financial records

Deploying pqsafe-openclaw to serve mainland Chinese users or to sign
financial records that fall under Chinese jurisdiction therefore requires:

  1. An SM2+SM3 signing backend (replacing ML-DSA-65 and ECDSA-P256).
  2. An SM-series post-quantum algorithm when one is standardized by OSCCA
     (OSCCA has published draft SM9 extensions; no PQ standard is finalized
     as of May 2026).
  3. A separate AP2 envelope ``alg`` value (e.g. "ap2-sm2+ap2-sm9") that
     the AP2 community must accept before it becomes interoperable.

ROADMAP NOTE
------------
SM2/SM3 support is on the PQSafe roadmap but NOT built in v0.1. There is
no ETA as of 2026-05-01. If you require mainland China deployment, contact
raymond@pqsafe.xyz to discuss the roadmap or a custom integration.

HONG KONG NOTE
--------------
Hong Kong maintains its own cryptographic standards under the HKMA's
Quantum Preparedness Index (announced February 3, 2026), which aligns with
NIST FIPS 204 (ML-DSA) rather than OSCCA algorithms. PQSafe v0.1 is
designed for Hong Kong-based regulated deployments and is fully compatible
with HKMA QPI requirements.

TAIWAN NOTE
-----------
Taiwan's Financial Supervisory Commission (FSC) has not issued comparable
restrictions on NIST algorithms. pqsafe-openclaw deploys without restrictions
in Taiwan.

USAGE
-----
This module is intentionally a stub. Calling any function raises
``NotImplementedError`` with a clear explanation. This ensures that if
a developer accidentally imports this module in a mainland China deployment
context, they get an actionable error rather than silent compliance failure.

To detect whether the runtime environment requires CN compliance checks,
call ``is_cn_deployment_required()`` which reads the ``PQSAFE_CN_DEPLOY``
environment variable.
"""

from __future__ import annotations

import os

# ---------------------------------------------------------------------------
# Public compliance statement (importable string for documentation tools)
# ---------------------------------------------------------------------------

CN_COMPLIANCE_STATEMENT = (
    "PQSafe AgentPay v0.1 uses ML-DSA-65 (NIST FIPS 204) and ECDSA-P256 "
    "(NIST). These algorithms are NOT OSCCA-approved under the March 2026 "
    "CAC/MIIT order for financial records originating in mainland China. "
    "SM2+SM3 (OSCCA) support is on the PQSafe roadmap but not yet implemented. "
    "Contact raymond@pqsafe.xyz for mainland China deployment guidance."
)


def is_cn_deployment_required() -> bool:
    """
    Return True if the runtime environment signals a mainland China deployment.

    Checks the ``PQSAFE_CN_DEPLOY`` environment variable. Set it to "1" or
    "true" in environments that require OSCCA compliance. When True, any
    attempt to sign or verify using NIST algorithms will raise
    ``NotImplementedError`` to prevent accidental non-compliant deployment.

    Returns
    -------
    bool
        True if PQSAFE_CN_DEPLOY is "1" or "true" (case-insensitive).
    """
    val = os.environ.get("PQSAFE_CN_DEPLOY", "").strip().lower()
    return val in ("1", "true", "yes")


def assert_not_cn_deployment() -> None:
    """
    Raise ``NotImplementedError`` if running in a mainland China deployment.

    Call this at the top of any signing or payment function to ensure NIST
    algorithms are not used in non-compliant jurisdictions.

    Raises
    ------
    NotImplementedError
        Always, when ``is_cn_deployment_required()`` returns True.
    """
    if is_cn_deployment_required():
        raise NotImplementedError(
            "\n"
            "╔══════════════════════════════════════════════════════════════════╗\n"
            "║         PQSafe OpenClaw — Mainland China Deployment Blocked      ║\n"
            "╠══════════════════════════════════════════════════════════════════╣\n"
            "║                                                                  ║\n"
            "║  The March 2026 CAC/MIIT order requires SM2+SM3 cryptography    ║\n"
            "║  for AI agent financial records in mainland China.               ║\n"
            "║                                                                  ║\n"
            "║  PQSafe v0.1 uses ML-DSA-65 + ECDSA-P256 (NIST FIPS 204).      ║\n"
            "║  These are NOT OSCCA-approved for mainland China financial use.  ║\n"
            "║                                                                  ║\n"
            "║  SM2/SM3 support is on the PQSafe roadmap (no ETA as of         ║\n"
            "║  2026-05-01). Contact raymond@pqsafe.xyz for status updates.    ║\n"
            "║                                                                  ║\n"
            "║  Hong Kong deployments are unaffected — HKMA QPI aligns with    ║\n"
            "║  NIST FIPS 204 (ML-DSA-65). See pqsafe.xyz/handbook.           ║\n"
            "║                                                                  ║\n"
            "╚══════════════════════════════════════════════════════════════════╝\n"
            "\n"
            f"Compliance statement: {CN_COMPLIANCE_STATEMENT}"
        )


def sm2_sign_stub(message_bytes: bytes, private_key_bytes: bytes) -> bytes:
    """
    STUB: SM2 signing is not implemented.

    This function exists as a placeholder to make the compliance gap explicit
    in code search and IDE navigation. Calling it always raises
    ``NotImplementedError``.

    When SM2 support is implemented, this function will be replaced with a
    real implementation using the pyca/gm-crypto or gmssl library.

    Raises
    ------
    NotImplementedError
        Always. SM2 signing is not yet implemented.
    """
    raise NotImplementedError(
        "sm2_sign_stub: SM2 signing is not implemented in pqsafe-openclaw v0.1. "
        "SM2+SM3 support is on the PQSafe roadmap for mainland China compliance. "
        "Contact raymond@pqsafe.xyz for the implementation timeline."
    )


def sm3_hash_stub(message_bytes: bytes) -> bytes:
    """
    STUB: SM3 hashing is not implemented.

    Raises
    ------
    NotImplementedError
        Always. SM3 hashing is not yet implemented.
    """
    raise NotImplementedError(
        "sm3_hash_stub: SM3 hashing is not implemented in pqsafe-openclaw v0.1. "
        "Contact raymond@pqsafe.xyz for SM3/SM2 implementation status."
    )
