# PQSafe AgentPay — 60-Second YC Founder Video Script
# Version: 1.0 | Target record date: April 30, 2026

---

## Production Setup (Read Before Recording)

### Equipment
- Camera: iPhone (4K, 30fps). Use rear camera. Lock focus and exposure before recording.
- Audio: Lavalier mic clipped to collar, 2-3 cm below chin. Test levels before full take.
- Screen capture: QuickTime Player > New Screen Recording, or OBS at 1080p 30fps. Record screen and iPhone separately; sync in iMovie or DaVinci Resolve on cut.

### Wardrobe
- Plain dark shirt (navy, charcoal, or black). No logo, no pattern, no text.
- No watch or jewelry that catches light.

### Location (talking head shots only)
- Plain wall — white, off-white, or medium grey. No art, shelves, or windows behind you.
- Light source: soft daylight from a window to your left or right (45-degree angle). Not behind you. Not directly overhead.
- If natural light is inconsistent, use a single LED panel diffused with paper or a white sheet.

### Screen setup (for screen capture shots)
- Browser: Chrome or Arc, dark mode off. Font size bumped up so code is legible at 1080p.
- Terminal: 18pt monospace font (JetBrains Mono or SF Mono). White or light text on dark background.
- Close all unrelated tabs and notifications. Enable Do Not Disturb.
- Pre-open tabs before recording: (1) demo.pqsafe.xyz, (2) Airwallex sandbox dashboard with transfer `38873dbc-abfa-4ab5-be25-050496d4a0c3` filtered and visible.

---

## Storyboard Sketch (6 Shots)

```
+---------------------------+  +---------------------------+
|  SHOT 1: TITLE CARD       |  |  SHOT 2: BROWSER DEMO     |
|                           |  |                           |
|  [black bg]               |  |  [demo.pqsafe.xyz]        |
|                           |  |  Keypair generated        |
|  "Every AI agent          |  |  Envelope signed          |
|   workflow ends at a      |  |  agent.pay() called       |
|   payment a human         |  |  UUID appears             |
|   still has to send.      |  |                           |
|   Watch this."            |  |  [cursor animating]       |
|                           |  |                           |
|  [white text, centered]   |  |  [no audio]               |
+---------------------------+  +---------------------------+

+---------------------------+  +---------------------------+
|  SHOT 3: TERMINAL         |  |  SHOT 4: AIRWALLEX DASH   |
|                           |  |                           |
|  [dark terminal]          |  |  [browser, real dashboard]|
|  python example.py        |  |                           |
|  > envelope signed        |  |  Transfer: $10.00 USD     |
|  > calling pay()          |  |  UUID: 38873dbc-abfa...   |
|  > transfer_id:           |  |  Status: PROCESSING       |
|    38873dbc-abfa-4ab5...  |  |                           |
|                           |  |  [zoom slowly to UUID]    |
|  [VO narrating]           |  |  [VO narrating]           |
+---------------------------+  +---------------------------+

+---------------------------+  +---------------------------+
|  SHOT 5: TALKING HEAD     |  |  SHOT 6: END CARD         |
|                           |  |                           |
|  [Raymond, eye-level]     |  |  [black bg, white text]   |
|  [plain wall behind]      |  |                           |
|  [soft side light]        |  |  pip install pqsafe       |
|                           |  |  npm i @pqsafe/agent-pay  |
|  30-45 seconds            |  |                           |
|  1 take, no cuts          |  |  demo.pqsafe.xyz          |
|                           |  |  pqsafe.xyz/handbook      |
|  [lav mic]                |  |                           |
+---------------------------+  +---------------------------+
```

---

## Shot-by-Shot Script with Timecodes

---

### SHOT 1 — Title Card (0:00 – 0:05) | 5 seconds | No audio

**Visual:**
Black background. White sans-serif text fades in over 0.5 seconds:

> "Every AI agent workflow ends at a payment a human still has to send. Watch this."

Hold 3.5 seconds. Hard cut to SHOT 2.

**Audio:** Silent.

**Post-production note:** This can be a static image, a Keynote slide recorded at 1080p, or a simple title generated in iMovie. No animation beyond the fade-in. Do not add music.

---

### SHOT 2 — Browser Demo: demo.pqsafe.xyz (0:05 – 0:18) | 13 seconds | Voiceover begins

**Visual:**
Screen capture. Browser showing `demo.pqsafe.xyz`. The demo runs:
1. Page loads. "Generate Keypair" button visible.
2. Click "Generate Keypair." ML-DSA-65 keypair appears (public key visible, truncated).
3. "Create Envelope" triggers. Fields visible: agent ID, max amount ($10), currency (USD), validUntil timestamp.
4. "Sign Envelope" completes. Signature hash appears.
5. "Send Payment" triggers. Loading spinner.
6. UUID `38873dbc-abfa-4ab5-be25-050496d4a0c3` appears on screen. Hold 2 seconds.

**Raymond voiceover (record separately, lay over screen):**

> "This is an ML-DSA-65 keypair — post-quantum signing — generated in your browser. The agent gets a spend envelope: ten dollars, one recipient, expires in an hour. The agent signs it. Calls pay(). That UUID is a real Airwallex transfer."

**Speaking pace:** Calm. Do not rush. The demo should drive the pacing — if the demo step takes longer than expected, add a half-second pause.

**[RAYMOND TO FILL]: Confirm demo.pqsafe.xyz is live and this exact sequence works before recording. If the public demo is not yet deployed, substitute a local screen recording of `npm run demo` in the agent-pay directory.**

---

### SHOT 3 — Terminal: Python SDK Example (0:18 – 0:30) | 12 seconds | Voiceover continues

**Visual:**
Screen capture. Dark terminal window. Run pre-recorded or live session showing:

```
$ python example.py

[PQSafe] Generating ML-DSA-65 keypair...
[PQSafe] Envelope created: $10.00 USD -> recipient@example.com
[PQSafe] Signed by issuer: pq1a3f9...
[PQSafe] Calling Airwallex rail...
[PQSafe] Transfer complete: 38873dbc-abfa-4ab5-be25-050496d4a0c3
```

Hold 2 seconds on the final UUID line.

**Raymond voiceover (continues from SHOT 2):**

> "Python SDK, same result. Four lines to install. The agent never touches credentials. It can only spend what the envelope allows, on the recipients the envelope lists, within the time window the issuer set."

**[RAYMOND TO FILL]: Python SDK must be published to PyPI before recording. If not yet live, show `pip install pqsafe` followed by the example in mock mode — annotate clearly with "mock mode: Airwallex sandbox" to stay honest.**

---

### SHOT 4 — Airwallex Dashboard (0:30 – 0:45) | 15 seconds | Voiceover continues

**Visual:**
Browser. Airwallex sandbox dashboard. Filter applied to show transfer `38873dbc-abfa-4ab5-be25-050496d4a0c3`. Visible fields:
- Amount: $10.00 USD
- Transfer ID / reference: `38873dbc-abfa-4ab5-be25-050496d4a0c3`
- Status: PROCESSING (or COMPLETED if settled)
- Created: 2026-04-15

Slow zoom toward the UUID and amount. Hold.

**Raymond voiceover:**

> "The same UUID. On the Airwallex dashboard. This is the sandbox, but the signing logic and the rail call are identical to production. The envelope constrained the amount, the recipient, and the time window. The agent did not have access to the account password, the full balance, or any other transfer."

**[RAYMOND TO FILL]: If Airwallex production rail is live by April 30, swap sandbox for the production dashboard and update the voiceover to say "production" instead of "sandbox." Production rail target is April 21 — check status before recording.**

---

### SHOT 5 — Talking Head (0:45 – 1:00) | 15 seconds | Raymond on camera

**Setup reminders:**
- Eye-level camera (prop phone against a stack of books or use a tripod).
- Look at the lens, not the screen.
- Plain wall behind you — nothing else.
- Soft daylight from the side. No overhead light alone.
- Dark shirt. No logo.
- Do one calibration take for audio levels before the real take.

**Script (speak naturally — this is not meant to be verbatim):**

> "I'm Raymond. I run 8 small businesses. My own AI agents kept hitting this wall — they'd draft the invoice, prep the wire, then stop. Because the payment still needed a human. I've shipped a Python and TypeScript SDK, plugins for LangChain, CrewAI, and Mastra, a public transfer ledger, and the Agent Payments Handbook. Post-quantum native from day one — because every bank will have to migrate, and I'd rather not rebuild this in three years. The demo is at demo.pqsafe.xyz. The handbook is at pqsafe.xyz/handbook."

**Word count:** ~90 words. At natural pace (2.8 words/sec) this lands at approximately 32 seconds — trim the last sentence if needed to fit 15 seconds, or move the CTA to voiceover only over the end card.

**Condensed 15-second version:**

> "I'm Raymond. I run 8 small businesses. My own agents kept hitting this wall — they'd draft the invoice, then stop. Because paying still needed a human. We've shipped a Python and TypeScript SDK, LangChain, CrewAI, and Mastra plugins, a public ledger, and the Agent Payments Handbook. Post-quantum native from day one."

**Take approach:** Record 3-4 takes. Do not stop mid-take for mistakes — keep going, pick the cleanest take in editing. Single cut preferred. No jump cuts on the talking head.

---

### ALTERNATE DIALOG (Gemini v9 patch — punchier opener + closer)

Use this take if the v1 script feels too long or too features-list. Cuts the word count roughly in half, sharper founder voice, stronger close.

| Time | Frame | Dialog |
|---|---|---|
| 0:00-0:05 | Camera on Raymond | "I'm Raymond. I run companies operated by AI agents. They can do everything except pay. That stops today." |
| 0:05-0:35 | Screen share: terminal + Airwallex | VO: "Watch this. My research agent needs a $50 API top-up. It requests a signed budget. Behind the scenes, a post-quantum ML-DSA-65 signature validates the envelope. The SDK hits Airwallex production. Wire sent. Zero manual banking." |
| 0:35-0:45 | Zoom on Airwallex dashboard | (silent, hold on matched UUID and $50 processed transaction) |
| 0:45-0:60 | Camera on Raymond | "Two years of cryptographic research at HKU, now live on Airwallex production. Post-quantum native. Ready to scale. AgentPay by PQSafe." |

**⚠️ Two caveats before using this version:**

1. **Gemini's original had a Telegram one-click approval step in the middle ("I get a ping in Telegram — one click, approve") that does NOT exist in any of the 5 shipped deliverables.** Dropped from the table above. Do not add it back unless Raymond actually builds the Telegram approval bot before recording (it would be a Band C / Band D approval gate — real feature, but not shipped).

2. **"Two years of cryptographic research at HKU"** — verify this claim before saying it on camera. Raymond's HKU MSc FinTech is real; the "two years of PQ-specific cryptographic research" framing is only true if he actually spent that time on lattice crypto / ML-DSA. If not, swap to truthful alternative: "PQSafe is built on my research at HKU with Prof. S.M. Yiu, Executive Director of the HKU-SCF FinTech Academy. Live on Airwallex production. Post-quantum native. AgentPay by PQSafe."

---

### SHOT 6 — End Card (1:00 – 1:10) | 10 seconds | No audio

**Visual:**
Black background. White text, stacked:

```
pip install pqsafe
npm i @pqsafe/agent-pay

demo.pqsafe.xyz
pqsafe.xyz/handbook
github.com/PQSafe/pqsafe
```

Fade in at 1:00. Hold 8 seconds. Fade to black.

**Audio:** Silent.

**[RAYMOND TO FILL]: Confirm all 4 URLs are live and correct before recording the end card. If the PyPI package name differs from `pqsafe`, update the install line.**

---

## Total Runtime: 60-70 seconds (target 63 seconds with natural pacing)

---

## Recording Order (to minimize setup changes)

1. Record screen capture shots first (SHOTS 2, 3, 4) — all in one sitting, same screen setup.
2. Record talking head last (SHOT 5) — after you have confirmed screen takes are clean.
3. Record Raymond voiceover (VO for SHOTS 2, 3, 4) — can be done simultaneously with screen or in a quiet room separately.
4. Build SHOT 1 and SHOT 6 as static slides in Keynote or iMovie — 10 minutes of work.
5. Assemble in iMovie: title card > browser demo > terminal > Airwallex dashboard > talking head > end card.
6. Export: 1080p H.264 MP4. File size target under 500MB for YC upload.

---

## What Raymond Needs to Do Before Recording

1. Confirm `demo.pqsafe.xyz` is publicly accessible and the full sign-envelopes-pay sequence completes in under 13 seconds of screen time.
2. Confirm Python SDK is published to PyPI (or prepare a clean mock-mode terminal recording as backup).
3. Confirm the Airwallex sandbox dashboard shows transfer `38873dbc-abfa-4ab5-be25-050496d4a0c3` and it is filterable. If Airwallex production rail is live by April 30, swap to production dashboard and update voiceover.
4. Do a dry run of the full script aloud before the recording day. Time it. Adjust the talking head condensed vs full version accordingly.
5. Charge iPhone to 100% and enable airplane mode (except for the Airwallex dashboard — that needs live internet). Record screen separately on Mac.
6. Test lavalier mic levels in the room where you will record the talking head, the day before.
