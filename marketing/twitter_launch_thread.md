# PQSafe AgentPay — Twitter/X Launch Thread
# Trigger: When Agent Payments Handbook + LangChain/CrewAI/Mastra plugins go live
# Target date: April 28, 2026 (Handbook publish) or April 24 (plugin publish) — whichever comes first

---

## Primary Thread (8 Tweets)

---

**Tweet 1 — HOOK**
[IMAGE: None. Text only. Pin this tweet after posting.]

> Every AI agent workflow ends at a wall: a payment a human still has to send. We just published the Agent Payments Handbook + open-source SDK that fixes this. Thread ->

Character count: 198. Safe.

---

**Tweet 2 — The Wall**
[IMAGE: Attach `demo_wall.png` — a simple diagram or annotated screenshot showing an agent workflow that stops at "payment step: human required." Can be made in Figma or Keynote in 15 minutes.]

> The pattern is always the same. Agent drafts the invoice. Agent researches the vendor. Agent prepares the wire. Then a human logs into Airwallex, Stripe, or their bank and clicks send. The agent contributed 90% of the work and 0% of the authorization. That's the wall.

Character count: 271. TRIM. Suggested trim:

> The pattern is always the same. Agent drafts the invoice, researches the vendor, prepares the wire. Then a human logs in and clicks send. The agent did 90% of the work and 0% of the authorization. That is the wall.

Character count: 220. Safe.

---

**Tweet 3 — The History**
[IMAGE: Optional. A simple timeline showing "2023: LLMs go mainstream" -> "2025: agents go autonomous" -> "2026: agents hit the payment wall." Black/white, no logo needed.]

> In 2023 LLMs became useful. In 2025 AI agents started running real ops. In 2026 every autonomous workflow is hitting the same structural gap: agents can read, write, search, and schedule. They cannot pay. Payments need authorization, audit trails, and bounded scope. None of those exist for agents today.

Character count: 298. TRIM. Suggested trim:

> In 2023 LLMs became useful. In 2025 agents started running real ops. In 2026 every autonomous workflow hits the same gap: agents can read, write, search, schedule. They cannot pay. Payments need authorization, audit trails, and bounded scope. None of those exist for agents.

Character count: 270. Safe (barely — verify with exact Twitter counter before posting).

---

**Tweet 4 — The Taxonomy (Spend Envelopes)**
[IMAGE: Attach `envelope_diagram.png` — a clean diagram of a SpendEnvelope showing the 5 key fields: agent ID, max amount, currency, allowed recipients, valid until. White background, monospace font. Can be exported from the handbook.]

> We built a primitive called a SpendEnvelope. It is a signed, capped authorization issued by a human to an AI agent. Fields: agent ID, max amount, currency, allowed recipients, time window. Signed with ML-DSA-65 (post-quantum). The agent can only spend what the envelope says. Nothing more.

Character count: 286. Safe (verify with counter).

Suggested trim if needed:

> We built a SpendEnvelope: a signed, capped authorization from human to agent. Fields: agent ID, max amount, currency, allowed recipients, time window. Post-quantum signed (ML-DSA-65). The agent can only spend what the envelope allows. Nothing more.

Character count: 248. Safe.

---

**Tweet 5 — The Security Layer (Band A-D Trust Gradient)**
[IMAGE: Attach `bands_table.png` — a 4-row table showing Band A (autonomous), Band B (daily report), Band C (threshold approval), Band D (hard blocked). Simple, readable at mobile scale.]

> Trust is a gradient, not a switch. Band A: agent pays autonomously (small recurring, allowlisted recipients). Band B: human gets a daily summary, no approval needed. Band C: approval required over threshold X. Band D: hard blocked, agent cannot execute, envelope must be rebuilt. You set the bands. You can revoke in one click.

Character count: 330. TRIM.

> Trust is a gradient, not a switch. Band A: fully autonomous. Band B: daily report, no approval. Band C: approval over threshold. Band D: hard blocked. You set the bands. You can revoke in one click. The agent earns autonomy incrementally as you build confidence in it.

Character count: 267. Safe.

---

**Tweet 6 — The Comparison**
[IMAGE: Attach `comparison_table.png` — 5-column table: PQSafe / Skyfire / Stripe+OpenAI / Google AP2 / Coinbase x402. Rows: dev SDK, fiat+crypto, post-quantum native, spend delegation primitives, dogfooded by operator. Simple, readable at 1080px width. White background.]

> Skyfire raised $9.5M with classical crypto (JWKS/RSA). Stripe+OpenAI is card-centric, no external SDK. Google AP2 is a standard, not an implementation. Coinbase x402 is crypto-only. None ship a developer SDK that routes fiat and crypto from a single signed envelope. None are post-quantum native.

Character count: 286. Safe.

---

**Tweet 7 — Integration Code Sample**
[IMAGE: Attach `code_sample.png` — a clean code screenshot at 1080px showing the 4-line Python or TypeScript install + send example. Dark background, syntax highlighted. Generate with Carbon.now.sh or Ray.so.]

> Four lines. Python:
>
> pip install pqsafe
>
> from pqsafe import AgentWallet, SpendEnvelope
> wallet = AgentWallet.from_env()
> result = wallet.pay(amount=10, currency="USD", recipient="vendor@example.com", note="API renewal")
>
> Works with LangChain, CrewAI, Mastra, and any MCP-compatible client.

Character count: 279. Safe. Adjust spacing for readability — Twitter renders code blocks poorly, so this works better as an image attachment. The tweet text should be a brief intro line pointing to the image.

Alternate tweet text:

> Four lines to give your AI agent a bounded payment capability. Works with LangChain, CrewAI, Mastra, and any MCP-compatible Claude/Cursor agent. [see image for Python + TypeScript samples]

Character count: 188. Safe. Use this as the tweet text with code image attached.

---

**Tweet 8 — CTA + Links**
[IMAGE: Attach `demo_gif.gif` — a screen recording of demo.pqsafe.xyz running the full sign-envelope-pay sequence, looped. Target <5MB GIF.]

> Read the Agent Payments Handbook: pqsafe.xyz/handbook
> Run the demo: demo.pqsafe.xyz
> Install: pip install pqsafe / npm i @pqsafe/agent-pay
> GitHub (MIT): github.com/PQSafe/pqsafe
>
> MCP server config for Claude/Cursor agents:
> {"mcpServers": {"pqsafe": {"command": "npx", "args": ["@pqsafe/mcp"]}}}
>
> If you build agents that need to pay for things, this is for you.

Character count: ~380. TRIM. The MCP config snippet may need to be an image. Suggested split:

> Read the Handbook: pqsafe.xyz/handbook
> Run the demo: demo.pqsafe.xyz
> pip install pqsafe | npm i @pqsafe/agent-pay
> GitHub (MIT): github.com/PQSafe/pqsafe
>
> MCP one-liner: {"mcpServers": {"pqsafe": {"command": "npx", "args": ["@pqsafe/mcp"]}}}
>
> If your agents need to pay for things, this is for you.

Character count: ~320. Still over. Move MCP config to image. Final tweet text:

> Handbook: pqsafe.xyz/handbook | Demo: demo.pqsafe.xyz | pip install pqsafe | npm i @pqsafe/agent-pay | MIT on GitHub. MCP config in image. If your agents need to pay for things, this is for you.

Character count: 198. Safe.

---

## Images to Prepare Before Posting

| Tweet | Image needed | Tool | Priority |
|---|---|---|---|
| 1 | None | — | — |
| 2 | `demo_wall.png` — workflow diagram | Figma or Keynote | High |
| 3 | `timeline.png` — optional | Figma or Keynote | Low |
| 4 | `envelope_diagram.png` — SpendEnvelope fields | Export from Handbook | High |
| 5 | `bands_table.png` — Band A-D table | Export from Handbook | High |
| 6 | `comparison_table.png` — competitor grid | Figma or Keynote | High |
| 7 | `code_sample.png` — Python 4-liner | Carbon.now.sh or Ray.so | High |
| 8 | `demo_gif.gif` — screen recording loop | QuickTime + Gifski | High |

---

## 3 Alternate Openers (in case Tweet 1 underperforms)

**Alternate A — Problem-first, no jargon:**
> AI agents can research, draft, schedule, and decide. They cannot pay. One unsigned wire and the whole workflow stops for a human. We built the infrastructure that closes that gap. Handbook + SDK are live. Thread ->

Character count: 218. Safe.

---

**Alternate B — Founder credibility first:**
> I run 8 small businesses. My AI agents draft every invoice, prepare every wire, and stop. Because I still have to click send. After shipping a real Airwallex sandbox transfer from a signed agent envelope, I wrote down everything I learned. The Agent Payments Handbook is now public. Thread ->

Character count: 285. Safe.

---

**Alternate C — Competitor angle:**
> Skyfire raised $9.5M for AI agent payments. Stripe+OpenAI ships card-centric. Google has a draft standard. None of them ship a 4-line open-source SDK that routes fiat and crypto from a post-quantum signed spend envelope. We do. Agent Payments Handbook is live. Thread ->

Character count: 268. Safe.

---

## Posting Notes

- Post on a Tuesday or Wednesday between 8:00-10:00 AM ET (peak developer engagement on X).
- After posting Tweet 1, reply to your own thread immediately with Tweets 2-8 in sequence. Do not schedule them — post manually for faster engagement tracking.
- After thread is live, post a standalone tweet linking to Tweet 1 from a LangChain-adjacent context ("If you use @LangChainAI and your agent needs to pay for something...").
- DM the thread link to any cold outreach contacts from Category A (Twitter DMs list) within 2 hours of posting.
- [RAYMOND TO FILL]: Tag any early users or design partners who gave feedback in Tweet 8, if they have consented.
- [RAYMOND TO FILL]: If the YC application is public by the time this thread posts, add "Applied to YC S26" to Tweet 8.

---

## What Raymond Needs to Do Before Posting

1. Confirm all 4 URLs are live: `pqsafe.xyz/handbook`, `demo.pqsafe.xyz`, `github.com/PQSafe/pqsafe`, and PyPI `pqsafe`.
2. Prepare all 5 high-priority images (see table above). Budget 2-3 hours.
3. Record `demo_gif.gif` from `demo.pqsafe.xyz`. Compress with Gifski to under 5MB.
4. Verify every tweet is under 280 characters using the actual Twitter character counter (some Unicode characters and URLs count differently).
5. Decide which alternate opener to use based on what has performed well in your recent posts, or A/B test by posting the primary opener and switching if it gets fewer than 20 impressions in the first 30 minutes.
