# PQSafe AgentPay Ledger — API Reference

Base URL: `https://ledger.pqsafe.xyz`

All responses are JSON. All public endpoints are CORS-enabled for `https://pqsafe.xyz`.

---

## Authentication

Only `POST /v1/log` requires authentication.

Pass your API key in the `X-Api-Key` header:

```
X-Api-Key: YOUR_LEDGER_API_KEY
```

API keys are issued by PQSafe and scoped to a specific agent/integration.

---

## Endpoints

### 1. Log a transfer (authenticated)

```
POST /v1/log
```

Ingest an anonymized record of a completed (or failed) agent payment.
No PII, no real recipient addresses, no raw amounts — only bucketed metadata.

**Request body (JSON):**

| Field          | Type   | Description                                          |
|----------------|--------|------------------------------------------------------|
| `envelopeHash` | string | SHA-256 hex (64 chars) of the signed SpendEnvelope bytes |
| `agentIdHash`  | string | SHA-256 hex (64 chars) of the agent identifier string |
| `rail`         | string | One of: `airwallex`, `wise`, `stripe`, `usdc-base`, `x402` |
| `amountBucket` | string | One of: `<10`, `10-100`, `100-1000`, `1000-10000`, `>10000` |
| `currency`     | string | ISO 4217 code (e.g. `USD`, `HKD`, `GBP`) |
| `outcome`      | string | One of: `success`, `failed`, `rejected`, `pending` |
| `timestamp`    | number | Unix timestamp in seconds (UTC) |

**Example:**

```bash
curl -X POST https://ledger.pqsafe.xyz/v1/log \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_LEDGER_API_KEY" \
  -d '{
    "envelopeHash":  "a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef",
    "agentIdHash":   "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    "rail":          "airwallex",
    "amountBucket":  "100-1000",
    "currency":      "USD",
    "outcome":       "success",
    "timestamp":     1745000000
  }'
```

**Response `201`:**

```json
{
  "ok": true,
  "envelopeHash": "a1b2c3d4..."
}
```

**Error codes:**
- `400` — validation failure (see `error` field)
- `401` — missing or invalid API key
- `409` — duplicate `envelopeHash` (already logged)
- `500` — server error

---

### 2. List recent transfers (public)

```
GET /v1/transfers?limit=20
```

Returns the most recent anonymized transfer records. Max `limit` is 50.

**Example:**

```bash
curl https://ledger.pqsafe.xyz/v1/transfers?limit=10
```

**Response `200`:**

```json
{
  "transfers": [
    {
      "id": 12,
      "envelopeHash": "a1b2c3d4e5f60718...",
      "agentIdHash":  "deadbeef...",
      "rail":         "airwallex",
      "amountBucket": "100-1000",
      "currency":     "USD",
      "outcome":      "success",
      "createdAt":    1745000000
    }
  ],
  "count": 1
}
```

---

### 3. Look up a single transfer (public)

```
GET /v1/transfers/:hash
```

Fetch a single record by its envelope hash. This is the canonical receipt URL:
`https://ledger.pqsafe.xyz/tx/<envelope_hash>`

**Example:**

```bash
curl https://ledger.pqsafe.xyz/v1/transfers/a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef
```

**Response `200`:** Single transfer object (same shape as list item above).

**Response `404`:**

```json
{ "error": "Transfer not found" }
```

---

### 4. Aggregate stats (public)

```
GET /v1/stats
```

Returns live aggregate counters for display on `ledger.pqsafe.xyz`.

**Example:**

```bash
curl https://ledger.pqsafe.xyz/v1/stats
```

**Response `200`:**

```json
{
  "totalTransfers": 2847,
  "totalUSDRouted": 1540000,
  "activeAgents": 31,
  "lastUpdated": 1745001234
}
```

| Field | Description |
|-------|-------------|
| `totalTransfers` | Count of all logged transfers |
| `totalUSDRouted` | Estimated USD routed (bucket midpoint × count) |
| `activeAgents` | Count of distinct `agentIdHash` values |
| `lastUpdated` | Unix timestamp of the most recent transfer |

---

## Privacy

- No real recipient addresses are stored.
- No actual transfer amounts are stored — only one of five buckets.
- Envelope hashes are SHA-256 of the full signed envelope bytes. The envelope contents cannot be recovered from the hash.
- Agent identifiers are hashed before logging. The original identifier is never stored.
- Opt-in only: the PQSafe SDK only calls `/v1/log` when the issuer sets `ledgerOptIn: true` in their configuration.

---

## SDK Integration (opt-in)

```typescript
import { PQSafeClient } from '@pqsafe/agent-pay'
import crypto from 'node:crypto'

const client = new PQSafeClient({
  ledger: {
    enabled: true,
    apiKey: process.env.PQSAFE_LEDGER_KEY,
    baseUrl: 'https://ledger.pqsafe.xyz',
  },
})

// After a successful payment:
await client.ledger.log({
  envelopeHash:  hashEnvelope(signedEnvelope),   // SHA-256 of envelope bytes
  agentIdHash:   hashString(envelope.agent),      // SHA-256 of agent id
  rail:          result.rail,
  amountBucket:  bucketAmount(result.amountUSD),
  currency:      envelope.currency,
  outcome:       result.success ? 'success' : 'failed',
  timestamp:     Math.floor(Date.now() / 1000),
})
```

Amount bucketing helper:

```typescript
function bucketAmount(usd: number): AmountBucket {
  if (usd < 10)     return '<10'
  if (usd < 100)    return '10-100'
  if (usd < 1000)   return '100-1000'
  if (usd < 10000)  return '1000-10000'
  return '>10000'
}
```
