from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.store.memory_store import nonce_store

RECIPIENT = "merchant_wallet_001"
ALT_RECIPIENT = "merchant_wallet_002"


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(autouse=True)
def reset_nonce_store():
    with nonce_store._lock:
        nonce_store._data.clear()


def _body(**overrides):
    body = {
        "mind_id": "mind-demo",
        "agent_id": "agent-demo",
        "merchant": RECIPIENT,
        "amount": 25.0,
        "currency": "USD",
        "memo": "demo authorization",
        "policy": {
            "whitelist": [RECIPIENT],
            "per_tx_limit": 100.0,
            "human_approval_threshold": 75.0,
            "valid_secs": 3600,
        },
        "rail": "airwallex",
    }
    body.update(overrides)
    return body


def _minds_tool_body(**overrides):
    body = {
        "mind_id": "mind-demo",
        "agent_id": "agent-demo",
        "merchant": RECIPIENT,
        "amount": 25.0,
        "currency": "USDC",
        "memo": "demo authorization",
        "policy": {
            "whitelist": [RECIPIENT],
            "single_payment_limit": 100.0,
            "require_memo": True,
        },
        "human_approved": False,
    }
    body.update(overrides)
    return body


async def _post(client: AsyncClient, body: dict):
    resp = await client.post("/api/minds/authorize-spend", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_minds_approved(client: AsyncClient) -> None:
    data = await _post(client, _body())

    assert data["decision"] == "approved"
    assert data["reason_code"] == "OK"
    assert data["wallet_action"] == {"allowed_to_continue": True, "settlement": "mock"}
    assert data["audit"]["signature_alg"] == "ML-DSA-65"
    assert len(data["audit"]["canonical_hash"]) == 64
    assert len(data["audit"]["policy_hash"]) == 64


@pytest.mark.asyncio
async def test_minds_tool_shape_approved(client: AsyncClient) -> None:
    data = await _post(client, _minds_tool_body())

    assert data["decision"] == "approved"
    assert data["reason_code"] == "OK"


@pytest.mark.asyncio
async def test_minds_amount_over_limit(client: AsyncClient) -> None:
    data = await _post(client, _body(amount=101.0))

    assert data["decision"] == "blocked_policy"
    assert data["reason_code"] == "AMOUNT_OVER_LIMIT"
    assert data["wallet_action"]["allowed_to_continue"] is False
    assert data["wallet_action"]["settlement"] == "none"


@pytest.mark.asyncio
async def test_minds_recipient_not_whitelisted(client: AsyncClient) -> None:
    data = await _post(client, _body(merchant=ALT_RECIPIENT))

    assert data["decision"] == "blocked_policy"
    assert data["reason_code"] == "RECIPIENT_NOT_WHITELISTED"
    assert data["wallet_action"]["allowed_to_continue"] is False


@pytest.mark.asyncio
async def test_minds_tamper_signature_invalid(client: AsyncClient) -> None:
    data = await _post(client, _body(_tamper_amount=999.0))

    assert data["decision"] == "blocked_tamper"
    assert data["reason_code"] == "SIGNATURE_INVALID"
    assert data["wallet_action"]["allowed_to_continue"] is False


@pytest.mark.asyncio
async def test_minds_replay_nonce(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.routers import minds

    monkeypatch.setattr(minds, "_new_nonce", lambda: "f" * 32)

    first = await _post(client, _body())
    assert first["decision"] == "approved"

    second = await _post(client, _body())
    assert second["decision"] == "blocked_tamper"
    assert second["reason_code"] == "REPLAY_NONCE"
    assert second["wallet_action"]["allowed_to_continue"] is False


@pytest.mark.asyncio
async def test_minds_needs_human_approval(client: AsyncClient) -> None:
    data = await _post(client, _body(amount=80.0))

    assert data["decision"] == "needs_human_approval"
    assert data["reason_code"] == "NEEDS_HUMAN_APPROVAL"
    assert data["wallet_action"]["allowed_to_continue"] is False


@pytest.mark.asyncio
async def test_minds_requires_memo(client: AsyncClient) -> None:
    data = await _post(client, _minds_tool_body(memo=""))

    assert data["decision"] == "blocked_policy"
    assert data["reason_code"] == "MEMO_REQUIRED"
    assert data["wallet_action"]["allowed_to_continue"] is False


@pytest.mark.asyncio
async def test_minds_bearer_auth_when_configured(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import minds

    monkeypatch.setattr(minds.settings, "pqsafe_api_key", "secret")

    missing = await client.post("/api/minds/authorize-spend", json=_minds_tool_body())
    assert missing.status_code == 401

    ok = await client.post(
        "/api/minds/authorize-spend",
        json=_minds_tool_body(),
        headers={"Authorization": "Bearer secret"},
    )
    assert ok.status_code == 200
    assert ok.json()["decision"] == "approved"


@pytest.mark.asyncio
async def test_minds_fail_closed_upstream_unreachable(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import minds

    def unavailable(*args, **kwargs):
        raise RuntimeError("verifier unavailable")

    monkeypatch.setattr(minds, "verify_signed_envelope", unavailable)

    data = await _post(client, _body())

    assert data["decision"] == "error"
    assert data["reason_code"] == "UPSTREAM_UNREACHABLE"
    assert data["wallet_action"] == {"allowed_to_continue": False, "settlement": "none"}
