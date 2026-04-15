# PQSafe AgentPay — Setup

## Quick start (mock mode — no credentials needed)

```bash
cd /Users/tun/Projects/pqsafe/agent-pay
npm install
npm run demo
```

This runs the full demo in **mock mode** — keypair generation, envelope signing, ML-DSA-65 verification, guard rails, and a mocked Airwallex `executePayment`. Use this for the YC video shoot if sandbox credentials aren't wired in yet.

## Live sandbox (what Raymond needs to do)

To flip from mock to real Airwallex sandbox, do these **three things**:

### 1. Create an Airwallex demo account

- Go to https://www.airwallex.com/hk/platform-api
- Click "Get started" → choose "Platform API"
- Use `hello@pqsafe.xyz` (alias of raymond@seniordeli.com) to keep it separate from production ventures
- Airwallex has a **demo environment** at `api-demo.airwallex.com` that doesn't need KYB — you get sandbox credentials immediately

### 2. Get API credentials

Inside the Airwallex dashboard:
- Settings → API keys → Create API key
- Copy `Client ID` and `API Key`
- Note: the demo env has a separate set of keys from production

### 3. Set environment variables

```bash
export AIRWALLEX_CLIENT_ID="<your-demo-client-id>"
export AIRWALLEX_API_KEY="<your-demo-api-key>"
export AIRWALLEX_ENV="sandbox"   # optional; "sandbox" is default

cd /Users/tun/Projects/pqsafe/agent-pay
npm run demo
```

The demo script will detect real credentials and print:
```
Mode    LIVE SANDBOX
```

instead of:
```
Mode    MOCK (no Airwallex creds set...)
```

## Force mock mode even with creds

```bash
PQSAFE_MOCK_MODE=1 npm run demo
```

Useful if you want to record the demo without making real sandbox calls.

## What the demo shows (60-sec shot list for YC video)

| Time | What the camera sees |
|---|---|
| 0:00 | Banner: "PQSafe AgentPay — post-quantum payment rails for AI agents" |
| 0:08 | Step 1: ML-DSA-65 keypair generated, PQSafe address derived |
| 0:18 | Step 2: spend envelope built with allowlist + amount cap + TTL |
| 0:28 | Step 3: signed (~3.3 KB signature) |
| 0:36 | Step 4: verified independently |
| 0:44 | Step 5: executed through guard rails → transaction ID |
| 0:52 | Step 6: over-spend + bad recipient rejected |
| 1:00 | Outro: "8 companies. 4 live hubs. Post-quantum rails." |

## What's real vs mocked right now

| Layer | Status |
|---|---|
| ML-DSA-65 keygen / sign / verify | **REAL** via `@noble/post-quantum` |
| Envelope schema + validation | **REAL** via zod |
| Guard rails (sig + schema + time + allowlist + amount) | **REAL** |
| Airwallex OAuth2 login | **REAL** (once creds are set) |
| Airwallex `/transfers/create` call | **REAL** (once creds are set) |
| Wise / Stripe / USDC-Base / x402 rails | Stubbed — throw on call |

## Next integrations (priority order)

1. **Airwallex sandbox credentials** — set env vars, run `npm run demo`, record video
2. **Beneficiary cache** — real Airwallex payouts need a beneficiary record; currently we inline bank details
3. **Wise rail** — second rail for routing diversity
4. **USDC-Base rail** — crypto path for agent-to-agent payments
5. **x402 rail** — HTTP-402 agent-to-agent protocol (Coinbase primitive)

## Troubleshooting

**`Cannot find module 'tsx'`** → run `npm install` first.
**`AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY must be set`** → either set them or run in mock mode (default when env vars are absent).
**`Airwallex auth failed (401)`** → credentials are wrong or you're using production creds on `api-demo.airwallex.com`. Check `AIRWALLEX_ENV`.
