# PQSafe Pause-Relay — Cloudflare Worker

Receives signed webhook POSTs from Forta and Tenderly. Routes by severity:

| Severity | Action |
|----------|--------|
| Critical | Build `pause()` tx via Gnosis Safe SDK, submit to Safe Transaction Service |
| High | Post alert to BetterStack + Slack `#security-alerts` |
| Medium/Low | Audit log only (Cloudflare Workers log tail) |

All inbound requests validated with HMAC-SHA256 over the raw request body.

---

## Prerequisites

- Cloudflare account (Workers paid tier: $5/month — required for KV + Secrets)
- Wrangler CLI: `npm install -g wrangler`
- Node.js ≥18

---

## Local development

```bash
npm install

# Run tests
npm test

# Start local dev server (uses Miniflare)
wrangler dev

# Tail logs in production
wrangler tail
```

---

## Deploy

### 1. Authenticate

```bash
wrangler login
```

### 2. Create KV namespace

```bash
wrangler kv:namespace create ALERT_KV
# Copy the `id` into wrangler.toml kv_namespaces[].id

wrangler kv:namespace create ALERT_KV --preview
# Copy the `id` into wrangler.toml kv_namespaces[].preview_id
```

### 3. Set secrets

```bash
# Generate a 32-byte hex secret (MUST match Forta agent + Tenderly action)
openssl rand -hex 32

wrangler secret put RELAY_HMAC_SECRET
wrangler secret put SAFE_TX_SERVICE_URL
# Value: https://safe-transaction-arbitrum.safe.global

wrangler secret put SAFE_ADDRESS
# Value: 0x<your_gnosis_safe_address>

wrangler secret put SAFE_OWNER_KEY
# Value: private key of the Worker signer address (holds PAUSER_ROLE on V2.1)
# IMPORTANT: this address must hold PAUSER_ROLE on the registry — NOT DEFAULT_ADMIN_ROLE
# It can pause but cannot unpause. Unpause requires 2-of-3 Gnosis Safe signers.

wrangler secret put CONTRACT_ADDRESS
# Value: 0x<SpendEnvelopeRegistryV2_1 mainnet address>

wrangler secret put BETTERSTACK_TOKEN
wrangler secret put SLACK_WEBHOOK_URL
```

### 4. Deploy

```bash
# Production
npm run deploy

# Staging (DRY_RUN=true — no real Safe txs)
npm run deploy:staging
```

### 5. Configure webhooks

**Forta:**
In Forta App → Subscriptions for your agent:
- Webhook URL: `https://pause-relay.pqsafe.workers.dev/forta`
- Add custom header: `X-PQSafe-Signature: <computed_by_forta>`

Note: Forta's webhook system supports custom headers. You'll need to pre-compute and configure the static HMAC if Forta doesn't support dynamic signing. Alternative: use a Forta-signed webhook (Forta provides its own signature header `x-forta-signature`) and validate that instead.

**Tenderly:**
In `tenderly.yaml`, the `PAUSE_RELAY_URL` secret points to:
`https://pause-relay.pqsafe.workers.dev/webhook`

The Tenderly action computes the HMAC and sets `X-PQSafe-Signature`.

---

## Security model

- The Worker signer (`SAFE_OWNER_KEY`) holds **PAUSER_ROLE only** — can call `pause()` but not `unpause()`
- The Worker proposes a Safe transaction — but the Safe's 2-of-3 threshold means **the pause actually executes only if 2 of 3 signers confirm** (Raymond + Tris + advisor)
- `unpause()` requires `DEFAULT_ADMIN_ROLE` — the Gnosis Safe 2-of-3 — never the Worker
- HMAC prevents forged webhook requests from triggering pause proposals
- KV deduplication prevents alert storms from triggering multiple parallel pause proposals

---

## Endpoints

| Path | Method | Description |
|------|--------|-------------|
| `/health` | GET | Health check (no auth required) |
| `/forta` | POST | Forta webhook receiver |
| `/webhook` | POST | Tenderly webhook receiver |

---

## Architecture context

```
Forta Agent / Tenderly Action
  ↓ POST (HMAC-signed)
Cloudflare Worker (this)
  ├── Critical → Gnosis Safe Transaction Service (propose pause() tx)
  │              → Safe multi-sig confirms → pause() executes on Arbitrum
  ├── High     → BetterStack incident + Slack #security-alerts
  └── Medium   → console.log (Workers log tail)
```
