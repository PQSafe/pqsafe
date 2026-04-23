# PQSafe AgentPay — Cold Outreach Templates
# Version: 1.0 | 2026-04-18
# STATUS: DRAFTS ONLY — Do not send without Raymond's review and personalization.

---

## IMPORTANT: Personalization Protocol

Every template below has [RAYMOND TO FILL] fields. Do not send any message without filling them in.
For Twitter DMs: spend 3 minutes on the person's profile before sending. Find one specific, recent thing they built or said. Use that as the opener. Generic openers will not be read.
For cold emails: verify the recipient's email format against known contacts at that company before sending.
For co-founder DMs: you are asking for something real (co-founder consideration). Be direct. Do not soft-pedal.

---

## CATEGORY A: Twitter DMs — LangChain / CrewAI / Mastra Builders

**Target:** 10 active builders using LangChain, CrewAI, or Mastra who have posted about agent workflows in the past 30 days. Do not target employees of those frameworks — target their users and contributors.

**How to find targets:**
- Search Twitter/X: `langchain agent production` or `crewai workflow` or `mastra agent` filtered to the past month.
- Look for: developers posting about agent failures, multi-step workflows, or production deployment pain.
- Avoid: people who only retweet announcements. Find people who post their own builds.

**What to look for in their bio/recent tweets before writing:**
- Specific agent framework they use (LangChain, CrewAI, Mastra — use their exact term)
- A specific workflow they described (e.g., "my agent that pulls invoices from email")
- A frustration they expressed (e.g., "I still have to manually approve every API charge")
- Their professional context (solo dev, startup, enterprise)

**Character limit: 500 per DM.**

---

**Template A-1: For someone who posted a multi-step agent workflow**

> Hi [RAYMOND TO FILL: first name] — saw your post about [RAYMOND TO FILL: specific thing they built or described, e.g., "your LangChain pipeline that pulls invoices from Gmail and drafts payment instructions"]. Quick question: when that workflow gets to the point where money actually needs to move, what does that step look like for you today? Asking because I'm building infrastructure for exactly that gap and want to understand where it actually hurts.

Character count: ~430. Safe.

Personalization cue: Use their exact workflow description. Avoid saying "I noticed" — it reads as copy-paste. Say "saw your post about X."

---

**Template A-2: For someone who posted about an agent failing or hitting a limit**

> Hi [RAYMOND TO FILL: first name] — your post about [RAYMOND TO FILL: the specific failure or limit they described, e.g., "agents hitting rate limits on paid APIs and needing a human to top up"] stuck with me. Is the payment step itself the blocker, or is it the authorization piece — someone having to approve before money moves? I'm building around that specific problem and want to know if I'm solving the right thing.

Character count: ~430. Safe.

Personalization cue: Quote or paraphrase the frustration they expressed. Ask a binary question to make it easy to reply.

---

**Template A-3: For a CrewAI builder specifically**

> Hi [RAYMOND TO FILL: first name] — saw you're building [RAYMOND TO FILL: specific crew or agent task they described] with CrewAI. When any agent in that crew needs to trigger a payment — vendor invoice, API subscription, anything with real money — what happens? Does it stop and wait for a human, or do you have something handling that today? Building payment infrastructure for exactly this and trying to understand the real pattern.

Character count: ~430. Safe.

Personalization cue: Mention CrewAI specifically. Reference the crew structure if they described it.

---

**Template A-4: For a Mastra builder**

> Hi [RAYMOND TO FILL: first name] — your work on [RAYMOND TO FILL: their specific Mastra workflow] looks interesting. I'm building a spend delegation layer for AI agents — so agents can pay for things within a bounded, signed budget without a human logging in each time. Honest question before I assume I know the problem: is the payment wall actually painful for you, or do you route around it some other way?

Character count: ~410. Safe.

Personalization cue: Acknowledge Mastra specifically — it signals you are not sending a mass blast. Mastra builders are a smaller, more technical community.

---

**Template A-5: For someone who explicitly said "I still have to X manually"**

> Hi [RAYMOND TO FILL: first name] — you mentioned [RAYMOND TO FILL: their exact quote or close paraphrase, e.g., "I still have to manually trigger every wire even though the agent does everything else"]. That is exactly the gap I'm building infrastructure for. What would "fixed" look like to you — is it the authorization piece, the audit trail, the rails, or something else? Trying to understand what actually matters before I assume.

Character count: ~440. Safe.

Personalization cue: Paraphrase their words back. "You mentioned" is stronger than "I noticed."

---

**Templates A-6 through A-10: Follow the same pattern.**

For the remaining 5 DMs, use the same structure:
1. Name one specific thing they built or said (1 sentence).
2. Ask one narrow question about their payment pain (1 sentence).
3. Optional: give one line of context about what you're building (1 sentence, not a pitch).

Do not link to pqsafe.xyz in the first DM. If they reply, follow up with context and a link.

[RAYMOND TO FILL: Write 5 more personalized versions after identifying the next 5 targets from Twitter/X search.]

---

**General rules for Category A:**
- Send no more than 3 DMs per day. Spacing matters.
- Do not follow up on a DM that was read but not replied to for more than 5 days — it was a "no."
- If they reply, ask a follow-up question before pitching. The goal of the DM is a conversation, not a demo link.
- Do not attach images or links to the first DM.

---

## CATEGORY B: Cold Emails — AP / Agentic Payments Devs at Airwallex / Wise / Stripe

**Target:** 5 people at Airwallex, Wise, or Stripe who work on APIs, developer experience, partnerships, or agentic/AI use cases. NOT the general BD team — look for people who have shipped agent-related features or written about agentic payments publicly.

**How to find targets:**
- LinkedIn: search "[Company] developer experience" or "[Company] AI payments" or "[Company] API platform."
- Look for: engineers or PMs who have posted about AI use cases, agent payments, or developer adoption.
- Airwallex APAC BD team is a secondary target.
- Stripe's new AI payments team (announced 2025-2026) is a primary target.

**Email format to guess:**
- Airwallex: firstname@airwallex.com or firstname.lastname@airwallex.com
- Wise: firstname.lastname@wise.com
- Stripe: firstname@stripe.com

**Soft ask:** a 15-minute call to understand what agent payment use cases they are seeing from their own developer base.

---

**Template B-1: Airwallex (developer or API team)**

Subject: Quick question — are you seeing AI agents trigger Airwallex transfers?

> Hi [RAYMOND TO FILL: first name],
>
> I've been building PQSafe AgentPay — a spend delegation SDK for AI agents using the Airwallex API. We have three verified sandbox transfer UUIDs as of April 15 and just published the Agent Payments Handbook (pqsafe.xyz/handbook).
>
> Quick question: are you seeing other developers try to use Airwallex from inside agent workflows? We're trying to understand whether this is an emerging pattern or still edge-case.
>
> Would a 15-minute call be useful? Happy to share what we've learned about the agent-payment integration surface.
>
> Raymond Chau | pqsafe.xyz | github.com/PQSafe/pqsafe

Body word count: 98 words. At limit.

[RAYMOND TO FILL: Insert the recipient's name and verify their exact role. If they have posted publicly about AI/agents, add one sentence referencing it before the "Quick question" line.]

---

**Template B-2: Wise (developer or partnership team)**

Subject: Agent payment use cases on Wise — are you tracking this?

> Hi [RAYMOND TO FILL: first name],
>
> I'm building PQSafe AgentPay — a signed spend envelope SDK that routes agent-triggered payments across Airwallex today, with Wise next in our rail roadmap.
>
> Question: is Wise seeing developer interest in using the API from AI agent workflows? We've shipped sandbox transfers and the Agent Payments Handbook — and are trying to understand which developers on the Wise platform are hitting the same payment-authorization gap.
>
> If it's a relevant problem internally, I'd value 15 minutes of your time. No sales deck — just trying to understand what you're seeing.
>
> Raymond Chau | pqsafe.xyz

Body word count: 97 words. At limit.

[RAYMOND TO FILL: Adjust "Wise next in our rail roadmap" to reflect actual integration status. If Wise sandbox is live by send date, change to "Airwallex live, Wise sandbox shipped."]

---

**Template B-3: Stripe (AI payments team or developer experience)**

Subject: Building on top of Stripe for agentic payments — worth 15 minutes?

> Hi [RAYMOND TO FILL: first name],
>
> I've been following Stripe's AI payments direction and building something complementary: PQSafe AgentPay, a spend delegation layer for AI agents. We sign and cap an agent's authorized budget before any rail call — Stripe, Airwallex, or Wise.
>
> Curious what use cases you're seeing from developers trying to run agent-triggered payments through Stripe. We've published the Agent Payments Handbook and have sandbox transfers live — happy to share notes if there's overlap.
>
> Would 15 minutes be worth it?
>
> Raymond Chau | pqsafe.xyz

Body word count: 92 words. At limit.

[RAYMOND TO FILL: If Stripe integration is live before sending, replace "Stripe, Airwallex, or Wise" with "Airwallex live, Stripe and Wise in roadmap" to be accurate. Do not claim Stripe integration is live if it is not.]

---

**Template B-4: Airwallex (APAC BD or partnerships)**

Subject: AI agent payment patterns on Airwallex — conversation?

> Hi [RAYMOND TO FILL: first name],
>
> I've built PQSafe AgentPay on the Airwallex sandbox API — signed spend envelopes for AI agents, three verified transfer UUIDs from April 15. Just published the Agent Payments Handbook covering the agent payment category.
>
> I'm curious whether Airwallex is seeing developer demand for agent-triggered transfers in APAC, or whether it's still a niche use case. Our use case is cross-border B2B: agents paying vendors, topping up APIs, settling invoices.
>
> Worth a 15-minute call to compare notes?
>
> Raymond Chau | pqsafe.xyz | HK-based

Body word count: 93 words. At limit.

[RAYMOND TO FILL: If you have any existing Airwallex contact (from sandbox onboarding, their developer community, etc.), mention that name in the first line: "Your colleague [name] pointed me toward you." This materially increases response rate.]

---

**Template B-5: Any of the three companies — for a PM or product lead who has written publicly about AI**

Subject: Re: [RAYMOND TO FILL: title of their article, post, or talk]

> Hi [RAYMOND TO FILL: first name],
>
> I read your [post/talk/thread] on [RAYMOND TO FILL: specific topic]. It framed the agent authorization problem in a way that matched what I've been building toward.
>
> I'm Raymond. I've shipped PQSafe AgentPay — spend delegation for AI agents via signed envelopes, Airwallex rail, sandbox transfers live since April 15. Published the Agent Payments Handbook this week.
>
> Would 15 minutes be useful? Specifically curious what use cases you're seeing from your own developer base that overlap with agentic payments.
>
> Raymond Chau | pqsafe.xyz

Body word count: 96 words. At limit.

[RAYMOND TO FILL: This template only works if the recipient has genuinely published something relevant. Find the specific post or talk first, then write the subject line. A subject line that references their own content has a 30-50% higher open rate than a generic subject.]

---

**General rules for Category B:**
- Send from raymond@seniordeli.com or a dedicated raymond@pqsafe.xyz address if set up. Do not send from a personal Gmail for cold outreach to corporate targets.
- Send one email per week per company, not multiple to different people at the same company simultaneously.
- If no reply in 7 days, send one follow-up (2 sentences: "Did this land? Happy to share the handbook if useful."). After that, stop.
- Do not attach files to the cold email. Link to the handbook instead.

---

## CATEGORY C: Co-Founder Outreach DMs (LinkedIn)

**Target:** 5 people with ex-Airwallex, Stripe, or Wise background who are PMs, backend engineers, or product leads. Currently available or recently left.

**How to find them — LinkedIn search queries:**

Search 1 (Airwallex alumni):
```
"Airwallex" AND ("product manager" OR "backend engineer" OR "payments")
Filter: Past company = Airwallex, Current company = [open / startup / self-employed]
```

Search 2 (Stripe alumni, APAC context):
```
"Stripe" AND ("payments infrastructure" OR "API" OR "developer platform")
Filter: Location = Hong Kong OR Singapore OR Sydney
```

Search 3 (Wise alumni):
```
"Wise" AND ("infrastructure" OR "platform" OR "rails")
Filter: Currently open to work OR at a startup <50 people
```

Search 4 (Crypto-infra background with payments context):
```
("Coinbase" OR "Circle" OR "Fireblocks") AND "payments" AND ("engineer" OR "product")
Filter: Location = Asia or SF
```

Search 5 (FinTech PM with developer-facing experience):
```
"developer experience" AND ("payments" OR "fintech")
Filter: Past company = any of the above; Connections = 2nd degree preferred
```

**Ideal candidate profile:**
- 3-8 years at Airwallex / Wise / Stripe / Coinbase in a product or backend eng role
- Has shipped a developer-facing payments API or integration
- Currently between roles, at an early startup, or recently independent
- Based in HK, Singapore, SF, or London (willing to relocate or work remote in YC context)
- Has expressed interest in AI, agents, or autonomous systems publicly

---

**Template C-1: Ex-Airwallex PM or Engineer**

> Hi [RAYMOND TO FILL: first name] — your time at Airwallex on [RAYMOND TO FILL: their specific team or product, e.g., "the global accounts platform"] is exactly the background I'm looking for. I'm applying to YC S26 on May 4 with PQSafe AgentPay — a spend delegation SDK for AI agents, Airwallex rail live since April 15.
>
> I'm a solo founder looking for one co-founder with rails and payments depth. The demo is at demo.pqsafe.xyz. The handbook is at pqsafe.xyz/handbook. The GitHub is public (MIT).
>
> Worth a conversation? Honest ask, not a sales call.

Character count: ~480. Safe.

[RAYMOND TO FILL: Replace "global accounts platform" with their actual team or product area from LinkedIn. If they have posted about PQSafe-adjacent topics publicly, add one sentence referencing it.]

---

**Template C-2: Ex-Stripe Backend Engineer**

> Hi [RAYMOND TO FILL: first name] — your infra background at Stripe looks directly relevant to what I'm building. PQSafe AgentPay is a payment SDK for AI agents — signed spend envelopes, multi-rail (Airwallex live, Wise + Stripe next), post-quantum signing (ML-DSA-65). Applying to YC S26 May 4.
>
> Looking for one co-founder: payments or rails depth, willing to go through YC with me if accepted. Everything is public — demo.pqsafe.xyz, pqsafe.xyz/handbook, github.com/PQSafe/pqsafe.
>
> If this is interesting at all, I'd rather have a direct conversation than a long thread. Worth 20 minutes?

Character count: ~490. Safe.

[RAYMOND TO FILL: Check if they have publicly discussed AI, agents, or developer tooling. If yes, add: "I saw your post about X — that context makes this conversation more relevant." If no public signal, skip this line.]

---

**Template C-3: Ex-Wise Engineer or PM**

> Hi [RAYMOND TO FILL: first name] — saw your background at Wise and wanted to reach out directly. I'm Raymond, applying to YC S26 May 4 with PQSafe AgentPay — spend delegation infrastructure for AI agents. Wise is next on our rail roadmap after Airwallex (sandbox live since April 15).
>
> I'm a solo founder actively looking for one co-founder with payments rails experience. YC deadline is May 4 — if there's interest, I'd want to move quickly. Demo + handbook + GitHub all public at pqsafe.xyz.
>
> Honest pitch, no fluff. Worth a call this week?

Character count: ~490. Safe.

[RAYMOND TO FILL: If Wise integration is live before sending, change "Wise is next on our rail roadmap" to "Wise sandbox shipped last week." Accuracy matters — they will know if you are exaggerating.]

---

**Template C-4: Ex-Coinbase or Crypto-Infra Engineer**

> Hi [RAYMOND TO FILL: first name] — your work on [RAYMOND TO FILL: their specific crypto infra role, e.g., "custody infrastructure at Coinbase"] is directly relevant to PQSafe. I'm building spend delegation for AI agents — post-quantum signed envelopes, Airwallex + USDC-Base rail, public audit ledger. Applying to YC S26 May 4 as a solo founder.
>
> Looking for one co-founder. Everything is public: demo.pqsafe.xyz, github.com/PQSafe/pqsafe, pqsafe.xyz/handbook. If the combination of AI agents + payments + post-quantum signing is interesting, I'd like to talk this week.
>
> Direct ask: are you open to co-founder conversations?

Character count: ~495. Safe.

[RAYMOND TO FILL: Specify their exact crypto infra role from LinkedIn. "Custody" vs "wallet" vs "settlement" are very different backgrounds — get it right.]

---

**Template C-5: FinTech PM with Developer-Facing Experience**

> Hi [RAYMOND TO FILL: first name] — your product background at [RAYMOND TO FILL: company] on the developer/API side looks like exactly what PQSafe needs in a co-founder. I'm building spend delegation infrastructure for AI agents — Airwallex rail live, YC S26 application due May 4.
>
> Honest framing: I'm a solo founder with a working demo, post-quantum signing, and a published handbook. I need a co-founder with payments product depth and ideally regulatory comfort (HKMA, MAS, or US). Willing to split equity fairly for the right person.
>
> Worth 20 minutes this week? demo.pqsafe.xyz + pqsafe.xyz/handbook if you want context first.

Character count: ~495. Safe.

[RAYMOND TO FILL: Replace "[company]" with their actual company. Add one specific sentence about why their exact background fits — e.g., "Your work on the Stripe Radar API product fits the trust-gradient problem we're solving."]

---

**General rules for Category C:**
- Connect on LinkedIn before DM'ing if not already connected. Connection request + note is acceptable: use 2 sentences max ("I'm applying to YC S26 with a payment SDK for AI agents and looking for a co-founder with your background. Would appreciate connecting.").
- After connecting, wait 24-48 hours before sending the full DM.
- Do not send co-founder outreach to someone who is currently employed at a major company in a senior role without first checking if they are publicly signaling openness to a move. Their LinkedIn "open to work" badge or recent posts about transitions are the signal.
- Do not mention equity split percentages in the first message.
- If they reply with interest, follow up within 4 hours. Co-founder timing is time-sensitive.
- [RAYMOND TO FILL: Identify the 5 specific candidates from LinkedIn before sending. Write their name, current status, and specific LinkedIn URL in a separate list for tracking.]

---

## CATEGORY D: $50 Subsidy Tactic — First External Paying User

**Target:** 20 developers in LangChain / CrewAI / AutoGPT / Mastra Discords or public posts who are actively building an autonomous agent and hitting the payment wall.

**Why this tactic beats Category A:** Category A asks for a conversation. Category D offers real money ($50 real Airwallex spend covered) in exchange for a verified external user + a 1-minute video testimonial. The testimonial lands directly in YC Section 3 ("users + revenue") as external validation. $1,000 max budget (20 × $50) to land one LOI — cheaper than any paid ad.

**Prerequisite:** Airwallex production rail must be LIVE (not sandbox). This is currently a blocker on Raymond — target Apr 22.

**Targets rank-ordered:**

1. Active contributors to LangChain / CrewAI / AutoGPT / Mastra Discord `#help` channels (public, easy to find)
2. Indie hackers building research agents, scraping agents, or procurement agents (look for "my agent does X" posts)
3. Developers who have posted on Hacker News or X in the last 60 days about payment bottlenecks, API top-ups, or human-approval fatigue
4. Creators of open-source agent tools with >50 GitHub stars (they have real usage, small enough to respond to DMs)

**LinkedIn / X search queries to find them:**
- `"my agent" "API key" site:twitter.com` (past 60 days)
- `"approve each" "agent" payment` (past 60 days)
- HN search: `agent autonomous payment` past month
- GitHub search: `autonomous agent SDK` stars:>10 pushed:>2026-03-01

**Template DM (copy-paste ready, <500 chars):**

```
Hi [NAME] — saw your post about [SPECIFIC AGENT PROJECT].

I'm shipping an open-source SDK that lets AI agents execute real payments under signed capped budgets (Airwallex live, MCP-native, MIT license).

I'll cover $50 of your agent's real-world spend this month if you route through @pqsafe/agent-pay and give me a 1-minute video testimonial after.

Demo: demo.pqsafe.xyz
Docs: pqsafe.xyz/handbook

15-min call? — Raymond
```

**Character count:** ~460. Under the 500-char DM limit on Twitter.

**Personalization fields (must fill):**
- `[NAME]` — their handle or first name
- `[SPECIFIC AGENT PROJECT]` — one specific thing from their recent posts

**The offer:**
- Raymond sends $50 via Airwallex to the developer's chosen recipient (API provider, freelancer, cloud invoice)
- Agent routes the payment through PQSafe SDK
- Transaction is verifiable on Airwallex production dashboard
- Developer records 60-second video: "I'm [name], I build [agent], I used PQSafe to pay [recipient] for $[amount]. It worked. Here's the receipt."

**Cadence:**
- Apr 20-22: identify 20 targets, verify Airwallex prod is live
- Apr 23-25: send 20 DMs (5 per day)
- Apr 26-30: fulfill subsidies, collect testimonials
- May 1: have at least 1 paying external user signed with testimonial in hand
- YC Section 3 updated with: "1 paying external user via subsidy program. Testimonial on file. Airwallex transaction UUID [X]."

**Budget:** $1,000 maximum. If zero bite after 20 DMs, the hypothesis is wrong — stop, don't go to 40.

**Fallback if Airwallex prod not live by Apr 22:** run the same offer on sandbox with clearly marked "sandbox transaction" in the testimonial. Less credible but still produces an external user artifact.

---

## What Raymond Needs to Do Before Sending Anything

1. Identify the specific 10 Twitter targets for Category A (30 minutes of Twitter/X search). Write their handles and the specific post you are referencing in a list. Do not send any DM without that list written down.

2. Verify the 5 email addresses for Category B using email verification tools (hunter.io or similar). A bounced cold email is worse than no email. Confirm at least one format works per company before mass-sending.

3. Identify the 5 co-founder candidates for Category C from LinkedIn. Write: name, current status, LinkedIn URL, exact background detail, and the one sentence that makes them specifically relevant. Do not send without this list.

4. Confirm the following are live before sending ANY outreach (all three categories will reference these):
   - `pqsafe.xyz/handbook` (public, readable without login)
   - `demo.pqsafe.xyz` (public, runnable without account)
   - `github.com/PQSafe/pqsafe` (public, MIT)

5. Set up a tracking sheet (Notion, Airtable, or plain spreadsheet) with columns: Name, Company, Platform, Template Used, Sent Date, Replied (Y/N), Follow-up Due. Update it after every send. Do not send from memory.

6. Do not send all 18 messages on the same day. Suggested schedule:
   - Day 1: 3 Twitter DMs (Category A)
   - Day 2: 2 cold emails (Category B) + 2 Twitter DMs
   - Day 3: 2 co-founder DMs (Category C) + 2 LinkedIn connects
   - Day 4: 3 Twitter DMs + 1 cold email
   - Day 5: 3 co-founder DMs + follow-ups to any Day 1-2 replies
   - Day 6-7: follow-ups only
