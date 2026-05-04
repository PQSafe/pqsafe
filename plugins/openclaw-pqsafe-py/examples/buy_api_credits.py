"""
examples/buy_api_credits.py — AI agent buys API credits using PQSafe OpenClaw.

This example shows an AI agent (e.g., a LangChain or CrewAI agent) authorizing
and executing a payment to top up API credits. The issuer (human) pre-signs a
SpendEnvelope that caps the agent's spending and restricts the recipient.

To run with mock mode (no real money, no API key needed):
    PQSAFE_MOCK_MODE=1 python examples/buy_api_credits.py

To run in live mode (requires PQSAFE_API_KEY):
    PQSAFE_API_KEY=pk_live_... PQSAFE_MOCK_MODE=0 python examples/buy_api_credits.py
"""

from __future__ import annotations

import os

from pqsafe_openclaw import PQSafeSkill

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# The issuer is the human wallet owner who authorized this agent.
# In production this address comes from the PQSafe wallet provisioning flow.
# Format: pq1 + 40 hex characters.
ISSUER = os.environ.get("PQSAFE_ISSUER", "pq1" + "a" * 40)  # placeholder

# The AI agent identifier. Used for audit trail and rate limiting.
AGENT = "raymond-ai-coo-v1"

# The API credits endpoint. Only this recipient will be accepted by the envelope.
API_CREDITS_RECIPIENT = "did:web:anthropic.com:payee:api-billing"

# Cap: agent can spend at most $49.99 USD in this authorization.
MAX_AMOUNT_USD = 49.99

# ---------------------------------------------------------------------------
# Step 1: Initialize the skill
# ---------------------------------------------------------------------------

skill = PQSafeSkill(
    mock_mode=(os.environ.get("PQSAFE_MOCK_MODE", "1") != "0"),
)

print(f"PQSafe OpenClaw skill initialized (mock_mode={skill._mock_mode})")
print()

# ---------------------------------------------------------------------------
# Step 2: Pre-authorize a SpendEnvelope
# ---------------------------------------------------------------------------
# The issuer pre-builds an envelope that authorizes the agent to spend up to
# $49.99 USD, but only to the Anthropic API billing endpoint. The envelope
# is valid for 1 hour (3600 seconds).
#
# In a production multi-agent system, the issuer would sign this envelope
# once and distribute it to the agent securely. The agent cannot forge or
# modify it — any tampering invalidates the ML-DSA-65 signature.

print("Building and signing SpendEnvelope...")
envelope_result = skill.set_envelope(
    issuer=ISSUER,
    agent=AGENT,
    max_amount=MAX_AMOUNT_USD,
    currency="USD",
    allowed_recipients=[API_CREDITS_RECIPIENT],
    rail="wise",          # route via Wise for USD international transfer
    ttl_seconds=3600,     # valid for 1 hour
)

if not envelope_result.ok:
    print(f"ERROR: Failed to build envelope: {envelope_result.error}")
    exit(1)

er = envelope_result.result
print(f"Envelope signed. Backend: {er['pq_backend']}")
print(f"Max amount: {er['max_amount']} {er['currency']}")
print(f"Valid for: {er['expires_in_seconds']} seconds")
print()

# ---------------------------------------------------------------------------
# Step 3: Agent pays for API credits
# ---------------------------------------------------------------------------
# The agent submits the actual payment. The PQSafe runtime re-verifies the
# signature, checks the recipient is in the allowlist, and confirms the amount
# does not exceed the envelope ceiling before submitting to the rail.

print("Agent submitting payment for API credits...")
pay_result = skill.pay(
    issuer=ISSUER,
    agent=AGENT,
    recipient=API_CREDITS_RECIPIENT,
    amount=25.00,           # $25 USD of API credits — within the $49.99 cap
    currency="USD",
    allowed_recipients=[API_CREDITS_RECIPIENT],
    rail="wise",
    memo="Top up Anthropic API credits — Raymond AI COO",
)

if not pay_result.ok:
    print(f"ERROR: Payment failed: {pay_result.error}")
    exit(1)

pr = pay_result.result
print(f"Payment submitted successfully!")
print(f"  Transaction ID: {pr['tx_id']}")
print(f"  Status:         {pr['status']}")
print(f"  Rail:           {pr['rail']}")
print(f"  Amount:         {pr['amount']} {pr['currency']}")
print(f"  Recipient:      {pr['recipient']}")
if pr.get("memo"):
    print(f"  Memo:           {pr['memo']}")
print(f"  Mock mode:      {pr['mock_mode']}")
print()

# ---------------------------------------------------------------------------
# Step 4: Query the transaction status
# ---------------------------------------------------------------------------

print("Querying transaction status...")
query_result = skill.query(pr["tx_id"])

if query_result.ok:
    qr = query_result.result
    print(f"Transaction {qr['tx_id']}: {qr['status']} (rail: {qr['rail']})")
else:
    print(f"Query not yet supported in live mode: {query_result.error}")

print()
print("Done. AI agent bought $25.00 USD of API credits via PQSafe OpenClaw.")
