"""
pqsafe-openclaw — PQSafe AgentPay skill for OpenClaw / ClawHub

Exposes post-quantum spend delegation to AI agents running in the OpenClaw
environment. Wraps the ``pqsafe-agent-pay`` Python SDK and produces
OpenClaw-compatible JSON responses that the ClawHub runtime (or the
TypeScript bridge skill) can relay to callers.

OpenClaw support status
-----------------------
OpenClaw v1.x supports TypeScript skills natively via SKILL.md + a JS
entry point. Python skills run as a subprocess bridge: the TS wrapper
invokes this package via ``python -m pqsafe_openclaw`` and reads the
JSON response from stdout. This is the documented cross-language bridge
pattern described in docs/skill-format.md §5.

Quick start
-----------
    from pqsafe_openclaw import PQSafeSkill

    skill = PQSafeSkill()
    result = skill.pay(
        issuer="pq1" + "a" * 40,
        agent="my-coo-v1",
        recipient="did:web:vendor.com:payee:main",
        amount=25.00,
        currency="HKD",
        rail="airwallex",
    )
    print(result)  # OpenClaw-compatible JSON dict

Links
-----
- PQSafe handbook:        https://pqsafe.xyz/handbook
- PQSafe GitHub:          https://github.com/PQSafe/pqsafe
- OpenClaw docs:          https://docs.openclaw.ai
- ClawHub registry:       https://clawhub.ai
- AP2 RFC (PQ ext):       https://pqsafe.xyz/ap2-pq-rfc
"""

from __future__ import annotations

from .skill import PQSafeSkill, SkillResult
from .envelope import AP2Mandate, build_ap2_envelope, verify_ap2_envelope
from .rails import RAILS, select_rail, RailInfo
from .cn_compliance import CN_COMPLIANCE_STATEMENT

__version__ = "0.1.0"

__all__ = [
    # Main skill entry point
    "PQSafeSkill",
    "SkillResult",
    # AP2-compatible envelope helpers
    "AP2Mandate",
    "build_ap2_envelope",
    "verify_ap2_envelope",
    # Rail selection
    "RAILS",
    "select_rail",
    "RailInfo",
    # China compliance stub info
    "CN_COMPLIANCE_STATEMENT",
    # Version
    "__version__",
]
