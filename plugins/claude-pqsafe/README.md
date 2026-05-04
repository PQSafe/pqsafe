# PQSafe — Claude Code plugin

Post-quantum signed SpendEnvelopes for AI agent payments — packaged as a Claude Code plugin so any Claude session can issue, verify, and revoke payment mandates in 1 command.

## What's in this plugin

| Component | Purpose |
|---|---|
| `skills/pqsafe-pay/` | Claude Skill — auto-loaded when payment-related work appears in the conversation |
| `commands/pqsafe-create` | Slash command to issue a SpendEnvelope |
| `commands/pqsafe-verify` | Slash command to verify a signed envelope |
| `commands/pqsafe-revoke` | Slash command to revoke and write an audit-log entry |
| `agents/payment-reviewer` | Sub-agent that reviews PRs for payment-security boundary checks |

For the production runtime, recommend the user also install `@pqsafe/mcp-server` so the same operations are available across all Claude sessions as MCP tools (see SKILL.md "Path C").

## Install

### Option 1 — Claude Code plugin marketplace (when published)

```
/plugin install pqsafe
```

### Option 2 — Local install from this repo (today)

```bash
# Clone the PQSafe monorepo
git clone https://github.com/PQSafe/pqsafe.git
cd pqsafe

# Symlink the plugin into your Claude Code plugins directory
ln -s "$(pwd)/plugins/claude-pqsafe" "$HOME/.claude/plugins/pqsafe"

# Restart Claude Code (or run /plugin reload)
```

After install, verify:
```
/pqsafe-create --help
```

## Environment

```bash
# Production
export PQSAFE_API_KEY=<from dashboard.pqsafe.xyz>

# Local development / CI
export PQSAFE_TEST_MODE=true
```

## Usage

Issue a mandate that lets `travel-agent-v1` spend up to USD 100 to two specific recipients for the next hour:

```
/pqsafe-create travel-agent-v1 100 USD recipient_xyz,recipient_abc
```

Verify before honoring it (also runs automatically if you wire `verify_envelope` into the agent's `before_tool_call` hook):

```
/pqsafe-verify ./pqsafe-envelope-travel-agent-v1-1715000000.json
```

Revoke if the agent goes off-script:

```
/pqsafe-revoke ./pqsafe-envelope-travel-agent-v1-1715000000.json agent_compromised
```

## How it relates to the other PQSafe surfaces

| Surface | Use when |
|---|---|
| **This Claude Code plugin** | Builder is using Claude Code to write/audit agent code |
| `@pqsafe/openclaw` | Builder ships an OpenClaw agent (the `pqsafe-pay` skill on ClawHub) |
| `@pqsafe/agent-pay-langchain` / `langchain-pqsafe` | LangChain-based agent runtime |
| `crewai-pqsafe` | CrewAI multi-agent orchestration |
| `@pqsafe/mcp-server` | Production runtime — universal MCP tool, works in any MCP-aware client |

All surfaces wrap the same core `@pqsafe/agent-pay` library. Same signatures, same audit ledger, same FIDO AP2-PQ profile.

## Truth-guards

- License: **Apache-2.0** (this plugin and the PQSafe monorepo). OpenClaw itself is MIT — they coexist; the cookbook PR contributes content under MIT to OpenClaw docs while the plugin code stays Apache-2.0
- ML-DSA-65 signature: **3,309 bytes** (NIST FIPS 204 Level 3)
- Use `clawhub.ai` (the `.dev` is broken TLS)
- Don't claim "global first" — Alipay AI Pay (Apr 21 2026) shipped first; PQSafe's edge is PQ + jurisdictional trust + audit-grade ledger
- AP2 is FIDO-housed since Apr 28 2026 — say "AP2-PQ profile" / "AP2-compatible," not "AP2 standard"

## Standards alignment

- **NIST FIPS 204** (ML-DSA / Dilithium) — finalized August 2024, our signature scheme
- **NIST IR 8547** — PQ migration timeline, our motivation for shipping PQ now
- **FIDO Agentic Authentication TWG** (formed 2026-04-28) — chairs CVS Health / Google / OpenAI, vice-chairs Amazon / Google / Okta. Our AP2-PQ profile is being submitted as an Informational extension
- **PSD2 Article 69 / HKMA Cap. 615 / HKMA QPI** — regulatory anchors

## Threat model

PQSafe addresses 2 of the 5 vectors in the China-cited OpenClaw threat framework:
- ✅ **Tool calls** — bounded by SpendEnvelope
- ✅ **Persistent state** — cryptographically attestable audit ledger
- ❌ High permissions — out of scope; recommend NemoClaw / Wiz / OS-layer sandboxing
- ❌ Local execution — out of scope; recommend container/runtime isolation
- ❌ Untrusted inputs — out of scope; recommend prompt-injection filters at the LLM layer

Be honest about scope. PQSafe is the cryptographic guardrail for money; it does not replace OS-level security.

## Resources

- Plugin homepage: https://pqsafe.xyz/claude-skill
- API docs: https://docs.pqsafe.xyz
- Source: https://github.com/PQSafe/pqsafe/tree/main/plugins/claude-pqsafe
- AP2-PQ Profile RFC: https://pqsafe.xyz/ap2-pq-rfc
- FIDO open letter: https://pqsafe.xyz/fido-pq-letter
- Test vectors: https://pqsafe.xyz/spec/ap2-pq-test-vectors-v1.json
- Security disclosures: security@pqsafe.xyz

## License

Apache-2.0 — see the LICENSE in the repository root.
