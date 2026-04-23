# PQSafe AgentPay Ledger

Public, anonymized transfer ledger for PQSafe AgentPay.
Hosted at `ledger.pqsafe.xyz`.

## What it is

Every PQSafe AgentPay transfer that opts in is logged here with anonymized metadata:
- Envelope hash (SHA-256 — no contents recoverable)
- Agent identifier hash (SHA-256)
- Payment rail (Airwallex, Wise, Stripe, USDC/Base, x402)
- Amount bucket (one of 5 ranges — no exact amounts)
- Currency (ISO 4217)
- Outcome (success / failed / rejected / pending)

No PII. No recipient addresses. No actual amounts. Opt-in only.

## Architecture

```
public/index.html     — Static frontend (Tailwind CDN, no build step)
worker/src/index.ts   — Cloudflare Worker (TypeScript)
migrations/0001_init.sql — D1 schema + 10 seed rows
wrangler.toml         — Cloudflare Worker + D1 config
```

## Deployment

### Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- Cloudflare account with Workers + D1 enabled
- `wrangler login`

### 1. Create the D1 database

```bash
wrangler d1 create pqsafe-ledger
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding       = "DB"
database_name = "pqsafe-ledger"
database_id   = "PASTE_YOUR_ID_HERE"
```

### 2. Run migrations (creates table + seeds 10 fake transfers)

```bash
# Local dev
wrangler d1 execute pqsafe-ledger --local --file=migrations/0001_init.sql

# Production
wrangler d1 execute pqsafe-ledger --remote --file=migrations/0001_init.sql
```

### 3. Set the API key secret

```bash
wrangler secret put LEDGER_API_KEY
# (paste your chosen key when prompted)
```

### 4. Deploy the Worker

```bash
cd worker && npm install && wrangler deploy
```

### 5. Update the frontend

In `public/index.html`, set `API_BASE` to your deployed worker URL:

```js
const API_BASE = 'https://pqsafe-ledger.YOUR_SUBDOMAIN.workers.dev'
```

Then deploy `public/index.html` to Cloudflare Pages (or any static host) under `ledger.pqsafe.xyz`.

### 6. Custom domain

In the Cloudflare dashboard:
- Workers: add route `ledger.pqsafe.xyz/v1/*` → `pqsafe-ledger` worker
- Pages: deploy `public/` to `ledger.pqsafe.xyz`

---

## Local development

```bash
cd worker
npm install
wrangler d1 execute pqsafe-ledger --local --file=../migrations/0001_init.sql
wrangler dev
```

Worker runs at `http://localhost:8787`. Update `API_BASE` in `index.html` to test locally.

---

## SDK opt-in (PQSafe AgentPay)

See [`public/api.md`](public/api.md) for full API reference and SDK integration snippet.

The SDK calls `POST /v1/log` after each payment when the issuer sets `ledgerOptIn: true`.
The envelope hash and agent ID hash are computed client-side before transmission — the server never sees raw identifiers.

---

## Privacy policy

- No PII is stored or transmitted.
- Envelope hashes are one-way (SHA-256). Original envelope contents cannot be recovered.
- Agent IDs are hashed before logging.
- Amount buckets prevent inference of exact payment amounts.
- Opt-in: logging only occurs when the wallet issuer explicitly enables it.
- Data is retained indefinitely for dataset purposes but contains no identifying information.

---

## Roadmap

- [ ] Fraud signal API (patterns: which beneficiaries reject, which buckets correlate with rejection)
- [ ] Weekly digest email for opted-in agents
- [ ] `GET /v1/agents/:hash` — per-agent history (anonymized)
- [ ] Webhook on new transfer (for pqsafe.xyz live ticker)
- [ ] Rate limiting on `/v1/log` per API key
