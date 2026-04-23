"""
PQSafe AgentPay Python SDK — 30-second quickstart.

This example runs end-to-end without making any HTTP requests.
Set dry_run=False and provide a real PQSAFE_API_KEY to hit the live API.

Run with:
    python examples/quickstart.py
"""

from pqsafe import (
    create_envelope,
    generate_keypair,
    pay,
    sign_envelope,
)

# Step 1: Generate an ML-DSA-65 key pair for the wallet owner
keypair = generate_keypair()
print(f"Backend: {keypair.backend}")
print(f"Public key ({len(keypair.public_key)} bytes): {keypair.public_key_hex()[:32]}...")

# Step 2: Create a SpendEnvelope authorizing an AI agent to pay up to $10 USD
# to a specific Airwallex UUID recipient (sandbox UUID from our test suite).
envelope = create_envelope(
    issuer="pq1" + "a" * 40,          # wallet owner's PQSafe address
    agent="raymond-ai-coo-v1",         # agent identifier
    max_amount=10.00,                  # cap spend at $10.00
    currency="USD",
    allowed_recipients=[
        "38873dbc-abfa-4ab5-be25-050496d4a0c3",  # Airwallex sandbox UUID
        "ca7e2951-0094-4cef-ae24-b7f192fbc83f",  # Airwallex sandbox UUID 2
    ],
    ttl_seconds=3600,                  # valid for 1 hour
)
print(f"\nEnvelope created:")
print(f"  Agent:      {envelope.agent}")
print(f"  Max spend:  {envelope.max_amount} {envelope.currency}")
print(f"  Valid for:  {(envelope.valid_until - envelope.valid_from) // 60} minutes")
print(f"  Recipients: {envelope.allowed_recipients}")

# Step 3: Sign the envelope with the issuer's ML-DSA-65 key
signed = sign_envelope(envelope, keypair)
print(f"\nEnvelope signed:")
print(f"  Signature ({len(signed.signature) // 2} bytes): {signed.signature[:32]}...")

# Step 4: Agent pays $5.00 — dry_run=True returns a fake tx_id without HTTP
result = pay(
    signed,
    recipient="38873dbc-abfa-4ab5-be25-050496d4a0c3",
    amount=5.00,
    memo="SeniorDeli supplier invoice #42",
    dry_run=True,          # set to False + provide PQSAFE_API_KEY for live call
)

print(f"\nPayment result:")
print(f"  tx_id:  {result.tx_id}")
print(f"  status: {result.status}")
print(f"  rail:   {result.rail}")
print("\nDone. Set dry_run=False and PQSAFE_API_KEY env var for live payments.")
