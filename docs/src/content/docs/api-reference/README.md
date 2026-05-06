---
title: API Reference
description: Auto-generated TypeDoc reference for @pqsafe/agent-pay
tableOfContents: true
editUrl: false
---

# PQSafe AgentPay — API Reference

This section is **auto-generated** from the JSDoc comments in
[`agent-pay/src/`](https://github.com/PQSafe/pqsafe/tree/main/agent-pay/src)
using [TypeDoc](https://typedoc.org/) v0.27+ with
[`typedoc-plugin-markdown`](https://github.com/tgreyuk/typedoc-plugin-markdown).

> **Note:** To regenerate this reference locally, run `npm run docs:api` from
> the root of the repository. The output is written to
> `docs/src/content/docs/api-reference/` and is committed alongside source
> changes. In CI, the docs build step (`npm run typedoc` in `docs/`) runs
> automatically before the Astro build on every push to `main` that touches
> `agent-pay/src/**`.

---

## What is covered

| Module | Description |
|---|---|
| `executeAgentPayment` | Core payment function — verify PQ signature, check revocation, route to rail |
| `envelope` | `createEnvelope`, `signEnvelope`, `verifyEnvelope` — SpendEnvelope lifecycle |
| `types` | `SpendEnvelope`, `SignedEnvelope`, `PaymentRequest`, `PaymentResult` |
| `canonical` | `canonicalJson` — deterministic JSON serialization used for signing |
| `rails` | `airwallex`, `wise`, `stripe`, `usdc-base`, `x402` — payment rail connectors |
| `adapters` | `AP2`, `StripeACP`, `ACP` — third-party adapter bridges |
| `approval` | `executeWithApproval`, `requestApproval` — human-in-the-loop approval gates |
| `ledger` | `submitToLedger`, `buildLedgerRecord` — immutable payment audit trail |
| `arbitrum` | `commitEnvelopeToArbitrum`, `isEnvelopeCommitted` — on-chain envelope registry |
| `sprint2` | `PQSafeError` hierarchy, revocation, TTL policy, hosted issuer |
| `config` | `getAgentPayConfig`, `setAgentPayConfig` — runtime configuration |

---

## Quick reference: most-used exports

```typescript
import {
  // Create + sign a spend envelope
  createEnvelope,
  signEnvelope,
  verifyEnvelope,

  // Execute a payment (main entrypoint)
  executeAgentPayment,

  // Approval gate
  executeWithApproval,

  // Ledger
  submitToLedger,

  // Error types
  PQSafeError,
  ApprovalRejectedError,
  ApprovalTimeoutError,
  EnvelopeRevokedError,
  EnvelopeExpiredError,
} from '@pqsafe/agent-pay'
```

---

## Error hierarchy

```
PQSafeError (base)
├── EnvelopeExpiredError       — validUntil in the past
├── EnvelopeRevokedError       — envelope found in revocation list
├── EpochInvalidatedError      — issuer epoch rotated
├── ApprovalRejectedError      — human explicitly rejected payment
└── ApprovalTimeoutError       — approval window elapsed without response
```

---

## Regenerating this reference

```bash
# From repo root — requires npm install first
npm run docs:api

# Or from the docs/ workspace directly
cd docs && npm run typedoc
```

The generated `.md` files will appear in this directory and will be picked up
automatically by Starlight's `autogenerate: { directory: 'api-reference' }`
sidebar config.

---

*Last generated: see git blame on this file. For the live auto-generated pages,
see the sub-pages in this section.*
