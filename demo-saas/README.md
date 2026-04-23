# PQSafe AgentPay — SaaS Self-Pay Demo

An AI agent buys its own API subscription. No human in the loop.

## Run in 3 commands

```bash
cd ~/Projects/pqsafe/agent-pay
npm install
npx tsx ../demo-saas/demo.ts
```

No credentials needed — runs in mock mode by default. Full signing + verification + guard-rails run for real; only the final Airwallex API call is mocked.

## Run against real Airwallex sandbox

```bash
cd ~/Projects/pqsafe/agent-pay
AIRWALLEX_CLIENT_ID=your_id AIRWALLEX_API_KEY=your_key npx tsx ../demo-saas/demo.ts
```

## What it demonstrates

1. Human generates ML-DSA-65 (NIST FIPS 204) keypair and issues a `SpendEnvelope`:
   `agent: "research-agent-v1"`, `maxAmount: 50 USD`, `allowedRecipients: ["perplexity.ai"]`, `ttl: 30 days`
2. Agent runs mid-task, hits Perplexity 402 paywall
3. Agent verifies envelope (sig + schema + time + allowlist + amount ceiling — all autonomous)
4. PQSafe issues a virtual Visa card bound to the envelope (spend cap = $50, expiry = envelope TTL)
5. Agent pays $20 for Perplexity Pro — transaction receipt UUID returned
6. Agent receives API key, resumes task
7. Log: `"Agent successfully purchased Perplexity Pro subscription. Remaining budget: $30/month."`

## Files

| File | Purpose |
|---|---|
| `demo.ts` | Runnable TypeScript demo script |
| `demo.md` | Human walkthrough for YC reviewers |
| `README.md` | This file |

## Related docs

- [`../docs/saas-self-pay-flow.md`](../docs/saas-self-pay-flow.md) — Full technical flow design
- [`../docs/virtual-card-architecture.md`](../docs/virtual-card-architecture.md) — Airwallex/Stripe virtual card integration spec
- [`../agent-pay/DEMO_RECEIPTS.md`](../agent-pay/DEMO_RECEIPTS.md) — Verified Airwallex sandbox receipts
