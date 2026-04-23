# PQSafe API Reference Server

FastAPI reference implementation for `api.pqsafe.xyz` — post-quantum safe payments for AI agents as a hosted HTTP API.

Design partners who prefer **"PQSafe as a service"** over self-hosting the SDK point their agents at this server.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| GET | `/version` | Version + crypto backend |
| POST | `/v1/envelopes` | Create unsigned envelope |
| POST | `/v1/envelopes/{id}/sign` | Submit ML-DSA-65 signature |
| GET | `/v1/envelopes/{id}` | Get envelope + signature status |
| POST | `/v1/pay` | Verify + route payment to rail |
| GET | `/v1/pay/{transfer_id}` | Poll transfer status |
| GET | `/v1/rails` | List available rails |
| GET | `/v1/rails/{rail}/quote` | Get rate + fee quote |
| GET | `/metrics` | Prometheus metrics |
| GET | `/docs` | Swagger UI |

## Quick start

```bash
cd api-reference
cp .env.example .env          # fill in AIRWALLEX_CLIENT_ID, AIRWALLEX_API_KEY
pip install -e ".[dev]"
uvicorn app.main:app --reload
# open http://localhost:8000/docs
```

Without Airwallex credentials, the server runs in **mock mode** automatically — all rail calls return realistic fake responses so you can test the full envelope flow locally.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AIRWALLEX_CLIENT_ID` | *(empty)* | Airwallex app client ID |
| `AIRWALLEX_API_KEY` | *(empty)* | Airwallex API key |
| `AIRWALLEX_MODE` | `sandbox` | `sandbox` or `prod` |
| `PQSAFE_API_KEY` | *(empty)* | Bearer token for write endpoints |
| `PQSAFE_MOCK_MODE` | `false` | Force mock mode (auto when creds absent) |
| `LOG_LEVEL` | `info` | Uvicorn log level |
| `CORS_ORIGINS` | `["*"]` | Allowed CORS origins |

## Running tests

```bash
# Mock mode (no credentials needed)
pytest tests/

# Airwallex sandbox (real HTTP to demo.airwallex.com)
AIRWALLEX_CLIENT_ID=xxx AIRWALLEX_API_KEY=xxx pytest tests/
```

## Deploy

### Fly.io (recommended)
```bash
fly launch --copy-config --name pqsafe-api
fly secrets set AIRWALLEX_CLIENT_ID=xxx AIRWALLEX_API_KEY=xxx PQSAFE_API_KEY=xxx
fly deploy
fly certs add api.pqsafe.xyz
```

### Railway
```bash
railway init && railway up
# Set env vars in Railway dashboard
# Add custom domain: api.pqsafe.xyz → railway domain
```

### Docker / Cloudflare Containers
```bash
docker build -t pqsafe-api .
docker run -p 8000:8000 --env-file .env pqsafe-api
```

## SDK migration

SDK consumers switch to hosted API with one config change:

```python
# Before (self-hosted SDK)
from pqsafe import pay
result = pay(signed, recipient="...", amount=10.0)

# After (hosted API — no SDK install needed)
import httpx
resp = httpx.post("https://api.pqsafe.xyz/v1/pay", json={
    "envelopeJson": signed.envelope_json,
    "signature": signed.signature,
    "dsaPublicKey": signed.dsa_public_key,
    "recipient": "...",
    "amount": 10.0,
})
```

## Storage

The reference server uses an in-memory dict store. For production:
- Replace `app/store/memory_store.py` with SQLAlchemy + asyncpg (Postgres) or aiosqlite
- Add Redis for nonce dedup across replicas
- The router interfaces (`get/put/exists`) remain unchanged

## Crypto backend

ML-DSA-65 (NIST FIPS 204) via `pqcrypto>=0.4.0`. Falls back to Ed25519 (`cryptography` library) when `pqcrypto` is not installable. The fallback is classical (not post-quantum secure) and clearly labelled in logs.
