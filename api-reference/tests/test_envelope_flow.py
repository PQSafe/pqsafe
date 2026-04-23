"""
PQSafe API Reference — integration test: full envelope → sign → pay flow.

Tests:
  1. POST /v1/envelopes — create envelope + get canonical hash
  2. POST /v1/envelopes/{id}/sign — verify signature acceptance
  3. POST /v1/pay — verify constraints + rail routing → transfer_id returned
  4. GET /v1/pay/{transfer_id} — verify status poll
  5. Constraint violations: wrong recipient, amount over limit, expired, replay

Airwallex sandbox credentials:
  Set AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY env vars to use real sandbox.
  Without them, tests run in mock mode (no real HTTP calls to Airwallex).

  pytest -s tests/test_envelope_flow.py        # mock mode
  AIRWALLEX_CLIENT_ID=... AIRWALLEX_API_KEY=... pytest tests/test_envelope_flow.py
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.store.memory_store import envelope_store, nonce_store, signed_envelope_store, transfer_store

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------

ISSUER_ADDRESS = "pq1" + "a" * 40
AGENT_ID = "test-agent-v1"
RECIPIENT = "GB29NWBK60161331926819"
ALT_RECIPIENT = "DE89370400440532013000"  # not in allowlist

# ---------------------------------------------------------------------------
# Crypto fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def keypair():
    """Generate a fresh ML-DSA-65 (or Ed25519 fallback) keypair for tests."""
    from app.crypto.envelope import active_backend

    try:
        from pqcrypto.sign.ml_dsa_65 import generate_keypair  # type: ignore
        pk, sk = generate_keypair()
        return {"public_key": bytes(pk), "secret_key": bytes(sk), "backend": "ml-dsa-65"}
    except ImportError:
        pass

    # Classical fallback
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.hazmat.primitives.serialization import (
        Encoding, NoEncryption, PrivateFormat, PublicFormat
    )
    priv = Ed25519PrivateKey.generate()
    pub = priv.public_key()
    return {
        "public_key": pub.public_bytes(Encoding.Raw, PublicFormat.Raw),
        "secret_key": priv.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption()),
        "backend": "ed25519-fallback",
    }


def _sign_bytes(message: bytes, secret_key: bytes, backend: str) -> bytes:
    """Sign bytes using whichever backend is available."""
    if backend == "ml-dsa-65":
        from pqcrypto.sign.ml_dsa_65 import sign  # type: ignore
        return bytes(sign(secret_key, message))

    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    priv = Ed25519PrivateKey.from_private_bytes(secret_key)
    return priv.sign(message)


# ---------------------------------------------------------------------------
# Client fixture
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def client():
    """ASGI test client — no real HTTP, in-process."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _reset_stores() -> None:
    """Clear all in-memory stores between tests."""
    for store in (envelope_store, signed_envelope_store, transfer_store, nonce_store):
        with store._lock:
            store._data.clear()


# ---------------------------------------------------------------------------
# Tests: system endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_version(client: AsyncClient) -> None:
    resp = await client.get("/version")
    assert resp.status_code == 200
    data = resp.json()
    assert "version" in data
    assert "crypto_backend" in data
    assert data["crypto_backend"] != "none"


# ---------------------------------------------------------------------------
# Tests: rails endpoints
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_rails(client: AsyncClient) -> None:
    resp = await client.get("/v1/rails")
    assert resp.status_code == 200
    data = resp.json()
    rail_names = [r["rail"] for r in data["rails"]]
    assert "airwallex" in rail_names
    assert data["default_rail"] == "airwallex"


@pytest.mark.asyncio
async def test_rail_quote_mock(client: AsyncClient) -> None:
    resp = await client.get(
        "/v1/rails/airwallex/quote",
        params={"amount": 100.0, "source_currency": "USD", "target_currency": "HKD"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["rail"] == "airwallex"
    assert "target_amount" in data


# ---------------------------------------------------------------------------
# Tests: full flow
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_full_envelope_sign_pay_flow(client: AsyncClient, keypair: dict) -> None:
    """
    Happy-path integration test:
      CREATE envelope → SIGN → PAY → GET status
    """
    _reset_stores()

    # 1. Create envelope
    now = int(time.time())
    create_body = {
        "issuer_pubkey": keypair["public_key"].hex(),
        "agent_id": AGENT_ID,
        "issuer_address": ISSUER_ADDRESS,
        "max_amount": 500.0,
        "currency": "USD",
        "allowed_recipients": [RECIPIENT],
        "valid_from": now,
        "valid_until": now + 3600,
    }
    resp = await client.post("/v1/envelopes", json=create_body)
    assert resp.status_code == 201, resp.text
    env_data = resp.json()
    envelope_id = env_data["id"]
    envelope_json = env_data["envelope_json"]
    assert env_data["status"] == "pending_signature"
    assert len(env_data["canonical_hash"]) == 64  # SHA-256 hex

    # 2. Sign the envelope
    msg_bytes = envelope_json.encode("utf-8")
    sig_bytes = _sign_bytes(msg_bytes, keypair["secret_key"], keypair["backend"])
    sig_hex = sig_bytes.hex()

    resp = await client.post(
        f"/v1/envelopes/{envelope_id}/sign",
        json={"signature": sig_hex},
    )
    assert resp.status_code == 200, resp.text
    sign_data = resp.json()
    assert sign_data["status"] == "signed"

    # 3. Verify GET reflects signed state
    resp = await client.get(f"/v1/envelopes/{envelope_id}")
    assert resp.status_code == 200
    get_data = resp.json()
    assert get_data["signed"] is True
    assert get_data["signature"] == sig_hex

    # 4. Pay using envelope_id
    pay_body = {
        "envelope_id": envelope_id,
        "recipient": RECIPIENT,
        "amount": 99.99,
        "memo": "test invoice #1",
    }
    resp = await client.post("/v1/pay", json=pay_body)
    assert resp.status_code == 201, resp.text
    pay_data = resp.json()
    assert "transferId" in pay_data
    assert pay_data["status"] in ("COMPLETED", "PENDING", "INITIATED")
    assert pay_data["rail"] == "airwallex"
    assert pay_data["amount"] == 99.99
    transfer_id = pay_data["transferId"]

    # 5. Get transfer status
    resp = await client.get(f"/v1/pay/{transfer_id}")
    assert resp.status_code == 200
    status_data = resp.json()
    assert status_data["transferId"] == transfer_id
    assert status_data["recipient"] == RECIPIENT


@pytest.mark.asyncio
async def test_inline_pay_mode(client: AsyncClient, keypair: dict) -> None:
    """
    Pay using inline envelope_json + signature + dsaPublicKey (TypeScript SDK wire format).
    """
    _reset_stores()

    from app.crypto.envelope import envelope_to_canonical_bytes

    now = int(time.time())
    raw = {
        "version": 1,
        "issuer": ISSUER_ADDRESS,
        "agent": AGENT_ID,
        "maxAmount": 200.0,
        "currency": "USD",
        "allowedRecipients": [RECIPIENT],
        "validFrom": now,
        "validUntil": now + 3600,
        "nonce": os.urandom(16).hex(),
    }
    canonical_bytes = envelope_to_canonical_bytes(raw)
    envelope_json = canonical_bytes.decode("utf-8")
    sig_bytes = _sign_bytes(canonical_bytes, keypair["secret_key"], keypair["backend"])

    pay_body = {
        "envelope_json": envelope_json,
        "signature": sig_bytes.hex(),
        "dsaPublicKey": keypair["public_key"].hex(),
        "recipient": RECIPIENT,
        "amount": 50.0,
    }
    resp = await client.post("/v1/pay", json=pay_body)
    assert resp.status_code == 201, resp.text
    pay_data = resp.json()
    assert "transferId" in pay_data


# ---------------------------------------------------------------------------
# Tests: constraint violations
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_wrong_recipient_rejected(client: AsyncClient, keypair: dict) -> None:
    """Payment to a recipient not in allowedRecipients must be rejected 422."""
    _reset_stores()

    now = int(time.time())
    create_body = {
        "issuer_pubkey": keypair["public_key"].hex(),
        "agent_id": AGENT_ID,
        "issuer_address": ISSUER_ADDRESS,
        "max_amount": 100.0,
        "currency": "USD",
        "allowed_recipients": [RECIPIENT],
        "valid_from": now,
        "valid_until": now + 3600,
    }
    resp = await client.post("/v1/envelopes", json=create_body)
    env_id = resp.json()["id"]
    envelope_json = resp.json()["envelope_json"]

    sig = _sign_bytes(envelope_json.encode(), keypair["secret_key"], keypair["backend"])
    await client.post(f"/v1/envelopes/{env_id}/sign", json={"signature": sig.hex()})

    pay_body = {"envelope_id": env_id, "recipient": ALT_RECIPIENT, "amount": 10.0}
    resp = await client.post("/v1/pay", json=pay_body)
    assert resp.status_code == 422
    assert "allowlist" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_amount_over_limit_rejected(client: AsyncClient, keypair: dict) -> None:
    """Payment exceeding maxAmount must be rejected 422."""
    _reset_stores()

    now = int(time.time())
    create_body = {
        "issuer_pubkey": keypair["public_key"].hex(),
        "agent_id": AGENT_ID,
        "issuer_address": ISSUER_ADDRESS,
        "max_amount": 50.0,
        "currency": "USD",
        "allowed_recipients": [RECIPIENT],
        "valid_from": now,
        "valid_until": now + 3600,
    }
    resp = await client.post("/v1/envelopes", json=create_body)
    env_id = resp.json()["id"]
    envelope_json = resp.json()["envelope_json"]

    sig = _sign_bytes(envelope_json.encode(), keypair["secret_key"], keypair["backend"])
    await client.post(f"/v1/envelopes/{env_id}/sign", json={"signature": sig.hex()})

    pay_body = {"envelope_id": env_id, "recipient": RECIPIENT, "amount": 51.0}
    resp = await client.post("/v1/pay", json=pay_body)
    assert resp.status_code == 422
    assert "maxAmount" in resp.json()["detail"] or "max_amount" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_expired_envelope_rejected(client: AsyncClient, keypair: dict) -> None:
    """Expired envelope must be rejected at sign time."""
    _reset_stores()

    now = int(time.time())
    # valid_until is in the past
    create_body = {
        "issuer_pubkey": keypair["public_key"].hex(),
        "agent_id": AGENT_ID,
        "issuer_address": ISSUER_ADDRESS,
        "max_amount": 100.0,
        "currency": "USD",
        "allowed_recipients": [RECIPIENT],
        "valid_from": now - 7200,
        "valid_until": now - 1,  # expired
    }
    resp = await client.post("/v1/envelopes", json=create_body)
    env_id = resp.json()["id"]
    envelope_json = resp.json()["envelope_json"]

    sig = _sign_bytes(envelope_json.encode(), keypair["secret_key"], keypair["backend"])
    resp = await client.post(f"/v1/envelopes/{env_id}/sign", json={"signature": sig.hex()})
    # Should fail at sign time with 422 (temporal check)
    assert resp.status_code == 422
    assert "expired" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_replay_nonce_rejected(client: AsyncClient, keypair: dict) -> None:
    """Second payment with the same envelope nonce must be rejected 409."""
    _reset_stores()

    now = int(time.time())
    nonce = os.urandom(16).hex()
    create_body = {
        "issuer_pubkey": keypair["public_key"].hex(),
        "agent_id": AGENT_ID,
        "issuer_address": ISSUER_ADDRESS,
        "max_amount": 500.0,
        "currency": "USD",
        "allowed_recipients": [RECIPIENT],
        "valid_from": now,
        "valid_until": now + 3600,
        "nonce": nonce,
    }
    resp = await client.post("/v1/envelopes", json=create_body)
    env_id = resp.json()["id"]
    envelope_json = resp.json()["envelope_json"]

    sig = _sign_bytes(envelope_json.encode(), keypair["secret_key"], keypair["backend"])
    await client.post(f"/v1/envelopes/{env_id}/sign", json={"signature": sig.hex()})

    pay_body = {"envelope_id": env_id, "recipient": RECIPIENT, "amount": 10.0}
    resp1 = await client.post("/v1/pay", json=pay_body)
    assert resp1.status_code == 201

    # Second attempt with same nonce (same envelope_id → same nonce)
    resp2 = await client.post("/v1/pay", json=pay_body)
    assert resp2.status_code == 409
    assert "replay" in resp2.json()["detail"].lower() or "nonce" in resp2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_tampered_signature_rejected(client: AsyncClient, keypair: dict) -> None:
    """A tampered signature must fail verification at sign time."""
    _reset_stores()

    now = int(time.time())
    create_body = {
        "issuer_pubkey": keypair["public_key"].hex(),
        "agent_id": AGENT_ID,
        "issuer_address": ISSUER_ADDRESS,
        "max_amount": 100.0,
        "currency": "USD",
        "allowed_recipients": [RECIPIENT],
        "valid_from": now,
        "valid_until": now + 3600,
    }
    resp = await client.post("/v1/envelopes", json=create_body)
    env_id = resp.json()["id"]
    envelope_json = resp.json()["envelope_json"]

    sig_bytes = _sign_bytes(envelope_json.encode(), keypair["secret_key"], keypair["backend"])
    # Flip the first byte to tamper
    tampered = bytes([sig_bytes[0] ^ 0xFF]) + sig_bytes[1:]

    resp = await client.post(f"/v1/envelopes/{env_id}/sign", json={"signature": tampered.hex()})
    assert resp.status_code == 422
    assert "verification failed" in resp.json()["detail"].lower() or "signature" in resp.json()["detail"].lower()
