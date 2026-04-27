# PQSafe Registry V2.1 — Tenderly Web3 Action

Tenderly Web3 Action that monitors `SpendEnvelopeRegistryV2_1` events and calls the Cloudflare Worker pause-relay when circuit-breaker thresholds are exceeded.

## How it works

Every mined transaction touching the V2.1 registry triggers the action. It:
1. Parses `EnvelopeCommitted`, `EnvelopeRevoked`, and `IssuerEpochAdvanced` logs.
2. Stores rolling event counts in Tenderly KV store (scoped per issuer, TTL-pruned).
3. Calls `https://pause-relay.pqsafe.workers.dev/webhook` with a signed payload when thresholds are crossed.

---

## Prerequisites

- Tenderly account with **Advanced** or **Scale** plan (required for Web3 Actions).
- Tenderly CLI: `npm install -g @tenderly/cli`
- Node.js ≥18

---

## Local setup

```bash
npm install
npm run build
npm test
```

---

## Deploy

### 1. Authenticate

```bash
tenderly login
```

### 2. Set secrets

```bash
tenderly actions set-secret CONTRACT_ADDRESS 0x<v2_1_arbitrum_mainnet_address>
tenderly actions set-secret CONTRACT_ADDRESS_SEPOLIA 0x<v2_1_sepolia_address>
tenderly actions set-secret PAUSE_RELAY_URL https://pause-relay.pqsafe.workers.dev/webhook
tenderly actions set-secret RELAY_HMAC_SECRET <random_256_bit_hex>
```

Generate the HMAC secret:
```bash
openssl rand -hex 32
```
Use the same value in the Cloudflare Worker `RELAY_HMAC_SECRET` secret.

### 3. Deploy actions

```bash
npm run deploy
# or: tenderly actions deploy
```

### 4. Verify in Tenderly dashboard

- Go to **pqsafe-registry-v2** project → **Actions**
- Confirm `circuit-breaker` is listed and enabled
- Check **Execution Logs** after a few blocks to confirm it's receiving transactions

---

## KV store schema

| Key pattern | Value | TTL |
|-------------|-------|-----|
| `pqsafe:commits:<issuer>` | Newline-delimited `<ts>\|<txHash>` entries | Pruned per-run (entries >1h removed) |
| `pqsafe:revokes:<revoker>` | Newline-delimited `<ts>\|<txHash>` entries | Pruned per-run (entries >1h removed) |
| `pqsafe:epochs:<issuer>` | Newline-delimited `<ts>\|<txHash>` entries | Pruned per-run (entries >24h removed) |

---

## Tenderly dashboard alerts (additional layer)

Beyond the Web3 Action, configure these Tenderly Alerts for defense-in-depth:

1. **Admin role change**: Alert on `RoleGranted`/`RoleRevoked` for `DEFAULT_ADMIN_ROLE` → Slack `#security-p0` + PagerDuty
2. **Any revert**: Alert on failed transactions to registry → daily digest
3. **Pause/Unpause**: Alert on `Paused`/`Unpaused` events → Slack `#security-alerts` + email Raymond

Configure via: Tenderly Dashboard → pqsafe-registry-v2 → Alerts → Add Alert.

---

## Cost

Tenderly Advanced plan: $200–400/month (includes Web3 Actions + simulation credits).
At production beta scale (~10K tx/day), this tier is sufficient.
