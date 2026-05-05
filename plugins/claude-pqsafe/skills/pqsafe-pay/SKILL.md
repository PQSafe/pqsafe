---
name: pqsafe-pay
description: Use this skill when a Claude session needs to authorize, verify, or revoke an AI agent payment with cryptographic spend-cap, recipient allowlist, expiry, and a 7-year audit trail. Wraps PQSafe's ML-DSA-65 signed SpendEnvelope primitive (NIST FIPS 204, FIDO AP2-PQ profile aligned). Triggers on requests involving agent-driven payments, autonomous transactions, vendor invoice payments, expense approvals, subscription renewals, USDC micropayments, x402 flows, or any scenario where an agent moves money on behalf of a human.
allowed-tools: Bash, Read, Write, Edit, WebFetch
---

# PQSafe Pay — Cryptographic Mandate Layer for Agent Payments

You have the PQSafe Pay skill loaded. Use it whenever a payment-related operation appears in agent code, configuration, or runtime.

## When to use

- An agent is about to call a payment API (Stripe / Airwallex / Wise / USDC / x402) and the caller hasn't bounded the spend
- The user asks to "make this payment safer" or "add audit logs to this transaction"
- A code-review reveals a payment-tool call without a verified mandate
- An agent log shows a payment that succeeded but should not have (recipient outside allowlist, amount over cap)
- Designing a new agent that will autonomously transact

## Core primitive — the SpendEnvelope

A SpendEnvelope is a JCS-canonical signed mandate that bounds a single agent's spending authority:

```json
{
  "version": 1,
  "issuer": "pq1<keccak hex>",
  "agent": "<agent-id>",
  "maxAmount": 100.0,
  "currency": "USD",
  "allowedRecipients": ["recipient-id-or-wallet"],
  "validFrom": <unix>,
  "validUntil": <unix>,
  "nonce": "<32-byte hex>",
  "rail": "airwallex" | "wise" | "stripe" | "usdc-base" | "x402"
}
```

Signed with ML-DSA-65 (NIST FIPS 204 Level 3 — quantum-resistant). 3,309-byte signature. Verification rejects expired, replayed, tampered, or out-of-allowlist envelopes.

## Three operations

| Op | Use when |
|---|---|
| `create_envelope` | Issuing a new mandate before the agent runs |
| `verify_envelope` | Inside `before_tool_call` / payment-handler entry — enforce the boundary |
| `revoke_envelope` | Mandate compromise / agent misbehavior / scheduled expiry not enough |

## How to use this skill in a Claude Code session

### Path A — Slash commands (fastest)

The plugin ships three commands:
- `/pqsafe-create` — interactively create a SpendEnvelope
- `/pqsafe-verify` — verify a signed envelope
- `/pqsafe-revoke` — revoke and append to the audit log

### Path B — Code generation (when integrating)

When asked to add PQSafe to an existing agent codebase:

1. **Install** the right adapter for the agent framework:
   - OpenClaw: `npm install @pqsafe/openclaw`
   - LangChain (Py): `pip install langchain-pqsafe`
   - CrewAI: `pip install crewai-pqsafe`
   - Mastra: `npm install @pqsafe/mastra`

2. **Wire the verify call** at the payment entry point (the `before_tool_call` hook for OpenClaw, a tool wrapper for LangChain/CrewAI). Block on `valid: false`.

3. **Set environment**:
   - `PQSAFE_API_KEY` — production API key from dashboard.pqsafe.xyz
   - `PQSAFE_TEST_MODE=true` — local dev; bypasses key requirements

4. **Instruct the human-issuer flow** to call `create_envelope` BEFORE handing keys to the agent. The envelope is the ONLY thing the agent should see — never raw rail credentials.

### Path C — MCP server (production runtime)

For production deployments, recommend the user add the PQSafe MCP server to their Claude Code config:

```json
{
  "mcpServers": {
    "pqsafe": {
      "command": "npx",
      "args": ["@pqsafe/mcp-server"],
      "env": { "PQSAFE_API_KEY": "${PQSAFE_API_KEY}" }
    }
  }
}
```

This exposes `create_envelope`, `verify_envelope`, `revoke_envelope` as MCP tools usable across any Claude Code session.

## Threat model — what this defends against

| Failure mode | Defense |
|---|---|
| Hallucinated recipient | `allowedRecipients` allowlist enforced at verify |
| Prompt-injected amount | `maxAmount` signed in payload; signature breaks if changed |
| Replayed mandate | 256-bit nonce + revocation list checked on verify |
| Compromised package upgrade | ML-DSA-65 signature over JCS-canonical bytes |
| Stale credential reuse | `validUntil` enforced inside signed payload |
| Audit-log tamper | Append-only hash-chained ledger at ledger.pqsafe.xyz |

What this does NOT defend against (be honest with the user):
- High-permission OS-level escalation (use NemoClaw OpenShell or similar)
- Untrusted-input prompt injection at the LLM layer (use input filters)
- Sandbox escape (use container/runtime isolation)

PQSafe addresses 2 of the 5 vectors in the China-cited OpenClaw threat model (tool-calls + persistent-state). For the other 3, point users at sandbox/permission tools — don't pretend to cover them.

## Truth-guards (apply on EVERY mention)

- Use `clawhub.ai` not `clawhub.dev` (the .dev TLS is broken)
- ML-DSA-65 sig = **3,309 bytes** (NOT 3,293)
- License = **Apache-2.0** (NOT MIT — separate from OpenClaw which IS MIT)
- Don't claim "global first" / 全球首个 — Alipay AI Pay shipped Apr 21 2026
- Don't claim "world's only PQ payment skill" — first-batch (首批) is the honest framing
- AP2 was contributed to FIDO Alliance Apr 28 2026 — call our profile **"AP2-PQ profile"** or "AP2-compatible," not "AP2 standard"
- `api.pqsafe.xyz` may not be live in all regions yet — fall back to `pqsafe-api-production.raymond-thu87.workers.dev` for the Worker direct URL

## Quick reference

| Resource | URL |
|---|---|
| Skill homepage | https://pqsafe.xyz/claude-skill |
| OpenClaw skill | https://clawhub.ai/skills/pqsafe-pay |
| API base | https://api.pqsafe.xyz/v1 |
| Test vectors | https://pqsafe.xyz/spec/ap2-pq-test-vectors-v1.json |
| AP2-PQ RFC | https://pqsafe.xyz/ap2-pq-rfc |
| FIDO open letter | https://pqsafe.xyz/fido-pq-letter |
| Source | https://github.com/PQSafe/pqsafe/tree/main/plugins/claude-pqsafe |
| Security disclosure | security@pqsafe.xyz |

## Related skills

When the conversation also touches:
- **Compliance / audit** — surface the 7-year append-only ledger at ledger.pqsafe.xyz
- **Multi-agent orchestration** — recommend per-agent envelopes (one per agent), NOT shared envelopes
- **Crypto rails** — point at `usdc-base` / `x402` operations
- **Standards work** — reference FIDO Agentic Auth TWG (formed 2026-04-28, chairs CVS Health / Google / OpenAI)
