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
4. PQSafe authorizes the payment: verifies the envelope is valid, unrevoked, within cap and allowlist, then signals the licensed rail (Airwallex) to proceed — PQSafe moves no funds
5. Airwallex executes the $20 charge to Perplexity Pro; transaction receipt UUID returned to the agent
6. Agent receives API key, resumes task
7. Log: `"Agent successfully purchased Perplexity Pro subscription. Remaining budget: $30/month."`

## Files

| File | Purpose |
|---|---|
| `demo.ts` | Runnable TypeScript demo script |
| `demo.md` | Human walkthrough for reviewers |
| `README.md` | This file |

## Related docs

- [`../docs/saas-self-pay-flow.md`](../docs/saas-self-pay-flow.md) — Full technical flow design
- [`../docs/virtual-card-architecture.md`](../docs/virtual-card-architecture.md) — Airwallex/Stripe virtual card integration spec
- [`../agent-pay/DEMO_RECEIPTS.md`](../agent-pay/DEMO_RECEIPTS.md) — Verified Airwallex sandbox receipts
