# Minds Adapter Production Deploy Runbook

Target route:

```text
POST https://api.pqsafe.xyz/api/minds/authorize-spend
```

Demo Day goal: expose the existing `pqsafe_authorize_spend` adapter as a live Minds Tool endpoint with bearer auth, health checks, CORS configured for Minds, and a repeatable smoke test for the four decision paths.

## 1. Local Verification

From repo root:

```bash
python -m pip install -e ".[dev]"
python -m pytest tests/test_minds.py tests/test_envelope_flow.py
```

Expected:

- `tests/test_minds.py` passes.
- `tests/test_envelope_flow.py` passes.
- `/version` returns `crypto_backend=ml-dsa-65` in production. If it returns `ed25519-fallback`, stop and fix the container build so `pqcrypto` installs correctly.

Decision behavior confirmed by tests:

- `approved`: valid signature, whitelisted merchant, amount within `single_payment_limit`, replay check passes, no human approval needed.
- `blocked_policy`: policy denies the request, including non-whitelisted merchant, over-limit amount, or missing memo when `require_memo=true`.
- `blocked_tamper`: signature/canonical verification failure or replayed nonce.
- `needs_human_approval`: amount is above the human approval threshold and `human_approved=false`.
- Fail-closed: unexpected verifier/runtime failure returns `decision=error`, `reason_code=UPSTREAM_UNREACHABLE`, and `wallet_action.allowed_to_continue=false`.

## 2. Required Production Env

Use platform secrets. Do not commit real values.

```bash
PQSAFE_API_KEY="<strong bearer token>"
PQSAFE_MOCK_MODE="true"
AIRWALLEX_MODE="sandbox"
CORS_ORIGINS='["https://minds.com","https://build.minds.com"]'
LOG_LEVEL="info"
```

Optional but recommended so audit identity remains stable across restarts:

```bash
python - <<'PY'
from app.crypto.envelope import generate_keypair
pk, sk = generate_keypair()
print("MINDS_ADAPTER_PUBLIC_KEY_HEX=" + pk.hex())
print("MINDS_ADAPTER_SECRET_KEY_HEX=" + sk.hex())
PY
```

Then set:

```bash
MINDS_ADAPTER_PUBLIC_KEY_HEX="<generated public key hex>"
MINDS_ADAPTER_SECRET_KEY_HEX="<generated secret key hex>"
```

[ESCALATE] raymond: confirm the exact browser origin used by the Minds Tool host before locking CORS. Until confirmed, keep a narrow allowlist plus the demo/test origin you actually use. Use `["*"]` only as a temporary last resort for Demo Day testing.

## 3. Docker/Fly Deploy Path

The repo already includes `Dockerfile`, `deploy/fly.toml`, and `deploy/deploy.sh`.

One-time setup:

```bash
fly auth login
fly apps create pqsafe-api --region sin
fly certs add api.pqsafe.xyz --app pqsafe-api
```

Set secrets:

```bash
fly secrets set \
  PQSAFE_API_KEY="$PQSAFE_API_KEY" \
  PQSAFE_MOCK_MODE="true" \
  AIRWALLEX_MODE="sandbox" \
  CORS_ORIGINS='["https://minds.com","https://build.minds.com"]' \
  MINDS_ADAPTER_PUBLIC_KEY_HEX="$MINDS_ADAPTER_PUBLIC_KEY_HEX" \
  MINDS_ADAPTER_SECRET_KEY_HEX="$MINDS_ADAPTER_SECRET_KEY_HEX" \
  --app pqsafe-api
```

Deploy:

```bash
fly deploy --app pqsafe-api --config deploy/fly.toml --dockerfile Dockerfile --remote-only
```

Health checks:

```bash
curl -fsS https://api.pqsafe.xyz/health
curl -fsS https://api.pqsafe.xyz/version
```

Expected `/health`:

```json
{"status":"ok"}
```

Expected `/version`:

```json
{"version":"0.1.0","crypto_backend":"ml-dsa-65","mock_mode":"true","airwallex_mode":"sandbox"}
```

If the custom domain is not ready, smoke against `https://pqsafe-api.fly.dev` first, then repeat against `https://api.pqsafe.xyz` after DNS/TLS is green.

## 4. Systemd/Uvicorn Alternative

Use this only if deploying on a VM instead of Fly.

Install:

```bash
sudo useradd --system --create-home --home-dir /opt/pqsafe pqsafe || true
sudo mkdir -p /opt/pqsafe
sudo chown -R pqsafe:pqsafe /opt/pqsafe
sudo -u pqsafe git clone <repo-url> /opt/pqsafe/api-reference
cd /opt/pqsafe/api-reference
sudo -u pqsafe python3.11 -m venv .venv
sudo -u pqsafe .venv/bin/pip install --upgrade pip
sudo -u pqsafe .venv/bin/pip install -e ".[dev]"
```

Secrets:

```bash
sudo mkdir -p /etc/pqsafe
sudo install -m 600 deploy/minds-api.env.example /etc/pqsafe/api.env
sudo editor /etc/pqsafe/api.env
```

Service:

```bash
sudo cp deploy/pqsafe-api.service /etc/systemd/system/pqsafe-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now pqsafe-api
sudo systemctl status pqsafe-api
curl -fsS http://127.0.0.1:8000/health
```

Reverse proxy:

- Terminate TLS for `api.pqsafe.xyz`.
- Proxy `/` to `http://127.0.0.1:8000`.
- Preserve `Authorization` and `Origin` headers.
- Keep `/health`, `/version`, `/docs`, and `/api/minds/authorize-spend` reachable.

## 5. Minds Tool Contract

Endpoint:

```text
POST /api/minds/authorize-spend
Authorization: Bearer <PQSAFE_API_KEY>
Content-Type: application/json
```

Request shape:

```json
{
  "mind_id": "mind-demo",
  "agent_id": "agent-demo",
  "merchant": "merchant_wallet_001",
  "amount": 25,
  "currency": "USDC",
  "memo": "Demo authorization",
  "policy": {
    "whitelist": ["merchant_wallet_001"],
    "single_payment_limit": 100,
    "require_memo": true
  },
  "human_approved": false
}
```

Response fields the Minds Tool should use:

```json
{
  "decision": "approved",
  "reason_code": "OK",
  "wallet_action": {
    "allowed_to_continue": true,
    "settlement": "mock"
  },
  "audit": {
    "crypto_backend": "ml-dsa-65",
    "signature_alg": "ML-DSA-65",
    "canonical_hash": "...",
    "policy_hash": "...",
    "nonce": "..."
  }
}
```

Only proceed in the tool when:

```text
decision == "approved" AND wallet_action.allowed_to_continue == true
```

All other decisions must stop the wallet/tool flow.

## 6. Smoke Test

Run:

```bash
export PQSAFE_API_KEY="<same bearer token deployed on server>"
API_URL=https://api.pqsafe.xyz/api/minds/authorize-spend \
  bash scripts/minds_authorize_spend_smoke.sh
```

The script exits non-zero if any decision path does not match:

- `approved`
- `blocked_policy`
- `blocked_tamper`
- `needs_human_approval`

## 7. Rollback

Fly:

```bash
fly releases --app pqsafe-api
fly deploy --app pqsafe-api --image <previous-image>
```

Systemd:

```bash
sudo systemctl stop pqsafe-api
cd /opt/pqsafe/api-reference
sudo -u pqsafe git checkout <known-good-commit>
sudo -u pqsafe .venv/bin/pip install -e ".[dev]"
sudo systemctl start pqsafe-api
curl -fsS http://127.0.0.1:8000/health
```
