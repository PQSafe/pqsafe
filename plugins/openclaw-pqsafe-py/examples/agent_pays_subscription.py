"""
examples/agent_pays_subscription.py — AI agent renews a SaaS subscription.

This example demonstrates the multi-recipient envelope pattern: a single
SpendEnvelope authorizes an agent to pay any of several approved vendors,
up to a total cap. Useful for AI COO agents that manage recurring software
subscriptions on behalf of a startup.

Shows:
- Multi-recipient allowlist (3 SaaS vendors)
- Envelope reuse: one sign, multiple pays
- AP2 dual-signed envelope for audit trail
- verify_received() to confirm payment authenticity as a receiver

Run:
    PQSAFE_MOCK_MODE=1 python examples/agent_pays_subscription.py
"""

from __future__ import annotations

import json
import os

from pqsafe_openclaw import PQSafeSkill, build_ap2_envelope, generate_mldsa_keypair

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ISSUER = os.environ.get("PQSAFE_ISSUER", "pq1" + "c" * 40)
AGENT = "raymond-ai-coo-subscriptions-v1"

# Three SaaS vendors the COO agent is authorized to pay
VENDORS = {
    "notion": "did:web:notion.so:billing:raymond-workspace",
    "linear": "did:web:linear.app:billing:pqsafe-team",
    "figma": "did:web:figma.com:billing:pqsafe-design",
}

MONTHLY_BUDGET_HKD = 2000.0  # HKD 2,000/month total subscription budget

# ---------------------------------------------------------------------------
# Initialize skill
# ---------------------------------------------------------------------------

skill = PQSafeSkill(mock_mode=True)

print("=== PQSafe OpenClaw — AI Agent Subscription Manager ===")
print(f"Agent:  {AGENT}")
print(f"Budget: HKD {MONTHLY_BUDGET_HKD:.2f}")
print()

# ---------------------------------------------------------------------------
# Build multi-recipient envelope
# ---------------------------------------------------------------------------

print("Building SpendEnvelope for 3 SaaS vendors...")
envelope_result = skill.set_envelope(
    issuer=ISSUER,
    agent=AGENT,
    max_amount=MONTHLY_BUDGET_HKD,
    currency="HKD",
    allowed_recipients=list(VENDORS.values()),
    rail="airwallex",     # HKD → Airwallex for Asia-Pacific payments
    ttl_seconds=86400,    # valid 24 hours (monthly subscription cycle)
)

if not envelope_result.ok:
    print(f"ERROR: {envelope_result.error}")
    exit(1)

er = envelope_result.result
print(f"Envelope signed. Backend: {er['pq_backend']}")
print(f"Allowlist: {len(er['allowed_recipients'])} recipients")
print()

# ---------------------------------------------------------------------------
# Pay each subscription
# ---------------------------------------------------------------------------

subscriptions = [
    ("notion",  780.0,  "Notion Plus — monthly renewal"),
    ("linear",  390.0,  "Linear Business — team plan"),
    ("figma",   600.0,  "Figma Professional — design team"),
]

print("Paying subscriptions...")
total_paid = 0.0

for vendor_key, amount, memo in subscriptions:
    recipient = VENDORS[vendor_key]

    result = skill.pay(
        issuer=ISSUER,
        agent=AGENT,
        recipient=recipient,
        amount=amount,
        currency="HKD",
        allowed_recipients=list(VENDORS.values()),
        rail="airwallex",
        memo=memo,
    )

    if result.ok:
        pr = result.result
        total_paid += amount
        print(f"  PAID  {vendor_key:8s}  HKD {amount:8.2f}  tx_id={pr['tx_id']}")
    else:
        print(f"  FAIL  {vendor_key:8s}  {result.error}")

print()
print(f"Total paid: HKD {total_paid:.2f} / {MONTHLY_BUDGET_HKD:.2f} budget")
print()

# ---------------------------------------------------------------------------
# Build AP2 dual-signed audit record
# ---------------------------------------------------------------------------
# In addition to the OpenClaw payment, the agent creates an AP2 mandate
# (dual-signed with ECDSA-P256 + ML-DSA-65) for the HKMA-compliant audit trail.
# This is the 7-year retention envelope described in the AP2 RFC v8.

print("Generating AP2 dual-signed audit mandate for HKMA Cap.615 retention...")

try:
    from pqsafe_openclaw.envelope import (
        AP2Mandate,
        ECDSAKeyPair,
        MLDSAKeyPair,
        build_ap2_envelope,
        generate_ecdsa_keypair,
        generate_mldsa_keypair,
        verify_ap2_envelope,
    )

    mldsa_kp = generate_mldsa_keypair()
    ecdsa_kp = generate_ecdsa_keypair()

    # Build a summary mandate for the batch payment
    audit_mandate = AP2Mandate(
        agent_id=f"did:web:agents.pqsafe.xyz:{AGENT}",
        amount=f"{total_paid:.2f}",
        currency="HKD",
        nonce=os.urandom(16).hex(),
        payee_constraints=[
            {"payee_id": VENDORS["notion"]},
            {"payee_id": VENDORS["linear"]},
            {"payee_id": VENDORS["figma"]},
        ],
        issued_at="2026-05-01T00:00:00.000Z",
        pq_algorithm="ML-DSA-65",
        pq_canonicalization="JCS",
    )

    dual_signed = build_ap2_envelope(audit_mandate, ecdsa_kp, mldsa_kp)
    envelope_dict = dual_signed.to_dict()

    print(f"  AP2 mandate signed. alg={envelope_dict['signature']['alg']}")
    print(f"  PQ fingerprint: {envelope_dict['signature']['pubkey_fingerprint']}")
    print(f"  ECDSA sig (B64url prefix): {envelope_dict['signature']['ecdsa'][:40]}...")
    print(f"  ML-DSA sig (B64url prefix): {envelope_dict['signature']['mldsa'][:40]}...")
    print()

    # Verify the dual-signed envelope (as a receiver would do)
    valid = verify_ap2_envelope(
        envelope_dict=envelope_dict,
        mldsa_public_key=mldsa_kp.public_key,
        ecdsa_public_key_compressed_hex=ecdsa_kp.public_key_compressed_hex,
    )
    print(f"  Verification result: {valid} (ECDSA-P256 + ML-DSA-65 both valid)")
    print()

    # Optionally: use the skill's verify_received for the same check
    verify_result = skill.verify_received(
        envelope=envelope_dict,
        mldsa_public_key_hex=mldsa_kp.public_key.hex(),
        ecdsa_public_key_compressed_hex=ecdsa_kp.public_key_compressed_hex,
    )
    print(f"  skill.verify_received(): ok={verify_result.ok}, "
          f"mldsa_verified={verify_result.result.get('mldsa_verified')}, "
          f"ecdsa_verified={verify_result.result.get('ecdsa_verified')}")

except ImportError as exc:
    print(f"  AP2 dual-signing skipped (missing dep: {exc})")

print()
print("Done. Subscription batch paid and AP2 audit mandate generated.")
print("Envelope suitable for HKMA Cap.615 7-year retention (ML-DSA-65 PQ signature).")
