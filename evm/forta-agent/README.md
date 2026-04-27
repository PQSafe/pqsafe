# PQSafe Registry V2.1 — Forta Monitoring Agent

Monitors `SpendEnvelopeRegistryV2_1` on Arbitrum One for three circuit-breaker conditions:

| Rule | Trigger | Severity |
|------|---------|----------|
| 1 | >1000 `EnvelopeCommitted` events/hr from one issuer | Critical |
| 2 | >100 `EnvelopeRevoked` events/hr from one revoker | Critical |
| 3 | >5 `IssuerEpochAdvanced` events in 24h from one issuer | Critical |

High-severity warnings fire at 75% of each threshold.

---

## Prerequisites

- Node.js ≥18
- Forta CLI: `npm install -g forta-agent`
- Docker (for container build)
- FORT token staking on Forta Network

---

## Local development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build TypeScript
npm run build

# Run agent locally against Arbitrum One
CONTRACT_ADDRESS=<deployed_v2_1_address> npm start
```

---

## Configuration

Set `CONTRACT_ADDRESS` environment variable before running:

```bash
export CONTRACT_ADDRESS=0x<your_v2_1_contract_address>
```

Update `forta.config.json`:
- `agentId` — assigned after `forta-agent push`
- `chainIds` — `[42161]` for mainnet only, `[42161, 421614]` for mainnet + Sepolia testnet
- `rpcUrls` — replace with your own Alchemy/Infura endpoints for higher throughput

---

## Deploying to Forta Network

### 1. Authenticate

```bash
forta-agent keyfile
# Enter passphrase; this creates ~/.forta/keyfile
```

### 2. Build and push the agent image

```bash
# Build Docker image
docker build -t pqsafe-forta-agent .

# Push to Forta registry (this assigns the agentId)
npm run push
```

Copy the returned `agentId` into `forta.config.json`.

### 3. Stake FORT and enable

Go to [app.forta.network](https://app.forta.network):
1. Navigate to **My Agents** → find your agent by ID.
2. Stake minimum 2,500 FORT (required for production scanning).
3. Set **Chains**: Arbitrum One (42161).
4. Enable the agent.

Cost estimate: ~$50–100/month in FORT staking + gas fees.

### 4. Subscribe to alerts (Forta webhook → Cloudflare Worker)

In Forta App → Alerts:
1. Create a new **Subscription** for your `agentId`.
2. Set **Webhook URL**: `https://pause-relay.pqsafe.workers.dev/forta`
3. Filter on severity: `Critical, High`
4. Optionally enable Slack/PagerDuty integrations.

The Cloudflare Worker (`pause-relay-worker/`) receives these webhooks and:
- On `Critical`: submits `pause()` transaction via Gnosis Safe
- On `High`: posts to BetterStack + Slack `#security-alerts`

---

## Sepolia testnet deployment

For pre-mainnet testing:
1. Deploy `SpendEnvelopeRegistryV2_1` to Arbitrum Sepolia (421614).
2. Set `CONTRACT_ADDRESS` to Sepolia contract address.
3. Update `forta.config.json` `scannerNetworkId` to `421614`.
4. Run locally: `npm start` — Forta CLI will scan Sepolia blocks.

---

## Alert routing config

```
Forta agent
  → Critical/High alert
  → Forta webhook subscription
  → POST https://pause-relay.pqsafe.workers.dev/forta
  → Cloudflare Worker validates HMAC
  → Critical: Gnosis Safe pause() tx
  → High: BetterStack + Slack
```

See `../pause-relay-worker/README.md` for Worker setup.

---

## Agent alert IDs

| Alert ID | Rule | Severity |
|----------|------|----------|
| `PQSAFE-COMMIT-RATE-CRITICAL` | Commit >1000/hr | Critical |
| `PQSAFE-COMMIT-RATE-HIGH` | Commit >750/hr | High |
| `PQSAFE-REVOKE-RATE-CRITICAL` | Revoke >100/hr | Critical |
| `PQSAFE-REVOKE-RATE-HIGH` | Revoke >75/hr | High |
| `PQSAFE-EPOCH-RATE-CRITICAL` | Epoch >5/24h | Critical |
| `PQSAFE-EPOCH-RATE-HIGH` | Epoch >4/24h | High |
