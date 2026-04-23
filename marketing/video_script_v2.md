# PQSafe AgentPay — 60-Second YC Founder Video Script
# Version: 2.0 | Target record date: April 30, 2026
# Change from v1: Two founders on camera. Raymond + Tris. 7 shots.

---

## What Changed in v2

- Talking head is now two founders: Raymond left-frame, Tris right-frame.
- Storyboard expanded from 6 shots to 7 (SHOT 5 split into 5a / 5b / 5c).
- Speaking time rebalanced: Raymond opens and closes; Tris owns the traction and market-urgency segment.
- Cue cards added for April 30 recording day — one card per take, prompter-ready.
- Recording order updated: screen shots first, then solo takes individually, combined close last.
- Alternate dialog (Gemini v9) updated so the closer is delivered jointly or in alternation.
- Pre-recording checklist updated for both founders.
- All URLs, UUIDs, install commands unchanged from v1.

---

## Production Setup (Read Before Recording)

### Equipment

- Camera: iPhone (4K, 30fps). Use rear camera. Lock focus and exposure before recording.
- Audio: TWO lavalier mics — one per founder, clipped to collar 2-3 cm below chin. Test levels for BOTH separately before the first take. Check that one mic does not bleed into the other in the combined shot.
- Screen capture: QuickTime Player > New Screen Recording, or OBS at 1080p 30fps. Record screen and iPhone separately; sync in iMovie or DaVinci Resolve on cut.

### Framing for Two-Founder Shots (SHOTS 5a, 5b, 5c)

- Camera distance: pull back so both founders fit in frame with roughly equal visual weight.
- Raymond: left half of frame. Tris: right half of frame.
- Both should face slightly toward center — a 10-15 degree inward turn prevents them looking like two separate headshots pasted together.
- Eye line: both look at the camera lens, not at each other, except in SHOT 5c (the close) where a brief look-at-each-other then look-at-camera beat is acceptable if it feels natural.
- Leave slight overlap in the center of frame — do not split the screen cleanly down the middle. It should feel like two people standing together, not a split-screen interview.

### Wardrobe

**Raymond:** Plain dark shirt (navy, charcoal, or black). No logo, no pattern, no text. No watch or jewelry that catches light.

**Tris:** Plain dark shirt — navy preferred. Avoid competing with Raymond's color; if Raymond wears navy, Tris wears charcoal or black and vice versa. No logo, no pattern, no text. No earrings that catch light. No accessories that draw the eye away from face.

**The goal:** Viewer attention stays on faces and words. Neither founder should visually outweigh the other.

### Location (talking head shots only)

- Plain wall — white, off-white, or medium grey. No art, shelves, or windows behind you.
- Light source: soft daylight from a window to your left or right (45-degree angle). Not behind you. Not directly overhead.
- With two people in frame, ensure the light is wide enough to cover both without one side falling into shadow. If natural light is too directional, add a second diffused LED panel on the opposite side at lower intensity to fill.
- If natural light is inconsistent, use a single LED panel diffused with paper or a white sheet, supplemented as above.

### Screen Setup (for screen capture shots — unchanged from v1)

- Browser: Chrome or Arc, dark mode off. Font size bumped up so code is legible at 1080p.
- Terminal: 18pt monospace font (JetBrains Mono or SF Mono). White or light text on dark background.
- Close all unrelated tabs and notifications. Enable Do Not Disturb.
- Pre-open tabs before recording: (1) demo.pqsafe.xyz, (2) Airwallex sandbox dashboard with transfer `38873dbc-abfa-4ab5-be25-050496d4a0c3` filtered and visible.

---

## Storyboard Sketch (7 Shots)

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
|  SHOT 5a: RAYMOND         |  |  SHOT 5b: TRIS            |
|                           |  |                           |
|  [Raymond, left-frame]    |  |  [Tris, right-frame]      |
|  [plain wall behind]      |  |  [same wall, same light]  |
|  [soft side light]        |  |  [continuous with 5a]     |
|                           |  |                           |
|  8 seconds                |  |  8 seconds                |
|  Who we are, what built   |  |  Traction, why now        |
|  [lav mic]                |  |  [lav mic]                |
+---------------------------+  +---------------------------+

+---------------------------+  +---------------------------+
|  SHOT 5c: BOTH FOUNDERS   |  |  SHOT 6: END CARD         |
|                           |  |                           |
|  [Raymond left,           |  |  [black bg, white text]   |
|   Tris right]             |  |                           |
|  [same wall, both lit]    |  |  pip install pqsafe       |
|                           |  |  npm i @pqsafe/agent-pay  |
|  3 seconds                |  |                           |
|  Unified close            |  |  demo.pqsafe.xyz          |
|  [both lav mics]          |  |  pqsafe.xyz/handbook      |
|                           |  |                           |
|                           |  |  [fade to black]          |
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

**Post-production note:** Static image, a Keynote slide recorded at 1080p, or a simple title generated in iMovie. No animation beyond the fade-in. Do not add music.

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

**Speaking pace:** Calm. Do not rush. The demo should drive the pacing — if a demo step takes longer than expected, add a half-second pause.

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

### SHOT 5a — Talking Head: Raymond (0:45 – 0:53) | 8 seconds | Raymond on camera, solo

**Frame:** Raymond alone. Left-side frame position matching the two-founder shots to follow, so a cutaway edit is seamless. Same wall, same light.

**Setup reminders:**
- Eye-level camera (prop phone against a stack of books or use a tripod).
- Look at the lens.
- Plain wall behind you.
- Soft daylight from the side.
- Dark shirt, no logo.
- Calibration take for audio levels before the real take.

**Script (speak naturally — not verbatim):**

> "I'm Raymond. I run eight small businesses on AI agents. They can draft the invoice, run the wire, then stop — because paying still needs a human. We built the fix. Python and TypeScript SDK, LangChain, CrewAI, Mastra plugins, a public ledger, and the Agent Payments Handbook. Post-quantum from day one."

**Condensed 8-second version (target):**

> "I'm Raymond. My AI agents can do everything except pay. We built the missing layer — post-quantum signed spend envelopes, live on Airwallex today."

**Take approach:** Record 3-4 takes. Do not stop mid-take — keep going. Pick the cleanest in editing. Single cut preferred.

---

### SHOT 5b — Talking Head: Tris (0:53 – 1:01) | 8 seconds | Tris on camera, solo

**Frame:** Tris alone. Right-side frame position matching the combined shot, same wall, same light. Cut directly from Raymond's take — it should feel like a handoff, not a scene change.

**Tris's voice:** She owns GTM, operations, and presentation. Her segment carries the market urgency and external validation. She does not talk about technical details — that is Raymond's ground. Her credibility is the wins and the why-now.

**Script (speak naturally — not verbatim):**

> "I'm Tris. Fifteen startup competition wins across four continents — and I've never seen a category move this fast. Every agent framework team we talk to hits the same wall Raymond described. The window to own agent payments is now, not in two years when the banks catch up."

**Condensed 8-second version (target):**

> "I'm Tris. I've won pitching competitions on four continents. This is the most urgent category I've seen — every agent developer hits this wall. We're the first team with post-quantum rails live."

**Take approach:** Same as Raymond's — 3-4 takes, no stopping mid-take, single cut preferred. Record separately from Raymond so a bad take by one does not waste the other's clean take.

---

### SHOT 5c — Both Founders (1:01 – 1:04) | 3 seconds | Raymond and Tris together

**Frame:** Both founders in frame. Raymond left, Tris right. Same wall, same light. Both lav mics live.

**This shot is the visual close.** It communicates: two founders, real team, aligned. The line is short — delivery and eye contact with camera matter more than the words.

**Script:**

> Raymond: "demo.pqsafe.xyz"
> Tris: "pqsafe.xyz/handbook"

Or, as a single unified line delivered overlapping or sequentially:

> Both: "AgentPay by PQSafe."

**Direction:** One take of the URL version, one take of the joint-name version. Decide in post which reads better on camera. The URL version is more practical if the end card URLs are also visible; the joint-name version is more cinematic.

**Take approach:** This is the most reshoottable segment — 5-6 takes if needed. Low word count, high visual impact. Get at least two clean takes of each option.

---

### SHOT 6 — End Card (1:04 – 1:14) | 10 seconds | No audio

**Visual:**
Black background. White text, stacked:

```
pip install pqsafe
npm i @pqsafe/agent-pay

demo.pqsafe.xyz
pqsafe.xyz/handbook
github.com/PQSafe/pqsafe
```

Fade in at 1:04. Hold 8 seconds. Fade to black.

**Audio:** Silent.

**[RAYMOND TO FILL]: Confirm all 4 URLs are live and correct before recording the end card. If the PyPI package name differs from `pqsafe`, update the install line.**

---

## Total Runtime: 64–74 seconds (target 67 seconds with natural pacing)

| Shot | Start | End | Duration |
|---|---|---|---|
| SHOT 1 — Title card | 0:00 | 0:05 | 5 sec |
| SHOT 2 — Browser demo | 0:05 | 0:18 | 13 sec |
| SHOT 3 — Terminal | 0:18 | 0:30 | 12 sec |
| SHOT 4 — Airwallex dashboard | 0:30 | 0:45 | 15 sec |
| SHOT 5a — Raymond talking head | 0:45 | 0:53 | 8 sec |
| SHOT 5b — Tris talking head | 0:53 | 1:01 | 8 sec |
| SHOT 5c — Both founders | 1:01 | 1:04 | 3 sec |
| SHOT 6 — End card | 1:04 | 1:14 | 10 sec |
| **Total** | | | **74 sec max** |

Trim 4-7 seconds from the Airwallex dashboard shot (SHOT 4) or tighten voiceover pace to land at 67 seconds if YC's upload field enforces 60 seconds strictly.

---

## Cue Cards for April 30 Recording Day

These are designed to be read on an iPhone in Teleprompter+ (or equivalent), landscape mode, 18pt+ monospace font, white text on black background. One card per take. Short enough to internalize in one read-through before the camera rolls — not meant to be read word-for-word on camera.

Print or load each card before the relevant take. The "FALLBACK" version is the 10-second backup if the primary version feels too long in practice.

---

```
====================================================
CUE CARD 1 — RAYMOND VOICEOVER (SHOTS 2, 3, 4)
====================================================

SHOT 2 (browser):
"ML-DSA-65 keypair. Browser-generated.
Agent gets a spend envelope: $10, one recipient,
expires in one hour. Agent signs it. Calls pay().
That UUID is a real Airwallex transfer."

SHOT 3 (terminal):
"Python SDK, same result. Four lines to install.
Agent never touches credentials.
Can only spend what the envelope allows,
on the listed recipients,
within the time window."

SHOT 4 (dashboard):
"Same UUID. Airwallex dashboard.
Sandbox — but signing logic and rail call
are identical to production.
Envelope constrained amount, recipient, time.
Agent had no access to the full account."

FALLBACK (single take if voiceover is one shot):
"Envelope signed. Agent calls pay().
UUID appears — real Airwallex transfer.
Amount capped, recipient locked, time-bound.
Agent never touched the credentials."

====================================================
```

---

```
====================================================
CUE CARD 2 — RAYMOND TALKING HEAD (SHOT 5a, 8 sec)
====================================================

PRIMARY:
"I'm Raymond.
My AI agents can do everything except pay.
We built the missing layer —
post-quantum signed spend envelopes,
live on Airwallex today."

FALLBACK (if tongue-tied, 6 sec version):
"I'm Raymond. My agents hit the payment wall.
We built PQSafe — post-quantum, live on Airwallex."

NOTES FOR RAYMOND:
- Look at the lens, not the card.
- Memorize the line, glance at card between takes.
- Pause half a beat after "I'm Raymond."
- Do not rush "post-quantum signed spend envelopes."

====================================================
```

---

```
====================================================
CUE CARD 3 — TRIS TALKING HEAD (SHOT 5b, 8 sec)
====================================================

PRIMARY:
"I'm Tris.
I've won pitching competitions on four continents.
This is the most urgent category I've seen.
Every agent developer hits this wall.
We're the first team with post-quantum rails live."

FALLBACK (if too long, 6 sec version):
"I'm Tris. Fifteen competition wins, four continents.
This window — agent payments — closes fast.
We're first with post-quantum rails live."

NOTES FOR TRIS:
- Own the urgency. This is your ground —
  not technical, not features. Market timing.
- "Four continents" lands harder with a beat after it.
- Do not explain what post-quantum means.
  Raymond covered it. Just claim it.
- 3-4 takes. Pick the most alive one, not the most careful.

====================================================
```

---

```
====================================================
CUE CARD 4 — COMBINED CLOSE (SHOT 5c, 3 sec)
====================================================

OPTION A (URLs, practical):
Raymond: "demo.pqsafe.xyz"
Tris:    "pqsafe.xyz/handbook"
(deliver sequentially, 1.5 sec each)

OPTION B (joint name, cinematic):
Both:    "AgentPay by PQSafe."
(deliver simultaneously or Raymond leads,
 Tris follows by half a beat)

NOTES:
- Shoot 3 takes of Option A, 3 takes of Option B.
- In Option B: do NOT try to be perfectly synchronized —
  a slight stagger reads as natural, not sloppy.
- Camera should hold on both founders' faces.
  No looking at each other unless it happens naturally.
- This is 3 seconds. The edit does the rest.

====================================================
```

---

## Alternate Dialog (Gemini v9 — Updated for Two Founders)

Use this version if the primary script feels too long or too feature-list-heavy in the talking-head segments. Cuts word count roughly in half, sharper founder voices, stronger close. The closer is now split between both founders.

| Time | Frame | Speaker | Dialog |
|---|---|---|---|
| 0:00–0:05 | Camera on Raymond, solo | Raymond | "I'm Raymond. I run companies operated by AI agents. They can do everything except pay. That stops today." |
| 0:05–0:35 | Screen share: terminal + Airwallex | Raymond VO | "Watch this. My research agent needs a $50 API top-up. It requests a signed budget. Behind the scenes, a post-quantum ML-DSA-65 signature validates the envelope. The SDK hits Airwallex production. Wire sent. Zero manual banking." |
| 0:35–0:45 | Zoom on Airwallex dashboard | (silent, hold on matched UUID and amount) | — |
| 0:45–0:52 | Camera on Tris, solo | Tris | "I'm Tris. Fifteen startup competition wins across four continents. This category moves faster than anything I've pitched. The agent payment window is open — and closing. We're first with post-quantum rails live." |
| 0:52–1:00 | Both founders in frame | Raymond + Tris | Raymond: "Built on research at HKU — live on Airwallex production." Tris: "Post-quantum native." Both (together): "AgentPay by PQSafe." |

**Two caveats before using this version — unchanged from v1:**

1. **The Telegram approval step** that appeared in an earlier Gemini draft ("I get a ping in Telegram — one click, approve") does not exist in any of the five shipped deliverables. Do not add it back unless the Telegram approval bot is actually built before recording.

2. **"Two years of cryptographic research at HKU"** — verify this claim before Raymond says it on camera. Raymond's HKU MSc FinTech is real; the "two years of PQ-specific cryptographic research" framing is only accurate if that time was specifically on lattice crypto / ML-DSA. If not, use the verified alternative: "PQSafe is built on my research at HKU with Prof. S.M. Yiu, Executive Director of the HKU-SCF FinTech Academy. Live on Airwallex production." The alternate dialog table above omits the "two years" claim to stay safe — verify before adding it back.

---

## Recording Order (Updated for Two Founders)

1. **Screen shots first (SHOTS 2, 3, 4)** — all in one sitting, same screen setup. Raymond records voiceover for these either simultaneously (whispered to self off-camera) or separately in a quiet room after screen takes are confirmed clean.

2. **Solo talking head: Raymond (SHOT 5a)** — Raymond alone. Get 3-4 clean takes before moving on. Do not have Tris present in frame — easier to re-shoot one person's screwup without wasting the other's time.

3. **Solo talking head: Tris (SHOT 5b)** — Tris alone, same wall, same light. Get 3-4 clean takes. Raymond does not need to be present for this.

4. **Combined close: both founders (SHOT 5c)** — shoot this last. By this point both founders have warmed up and the setup (light, mic levels, framing) is locked. Shoot both Option A (URLs) and Option B (joint name), 3 takes each.

5. **Build SHOT 1 and SHOT 6** as static slides in Keynote or iMovie — 10 minutes of work, can be done any time before assembly.

6. **Assemble in iMovie:** title card > browser demo > terminal > Airwallex dashboard > Raymond talking head > Tris talking head > both founders > end card.

7. **Export:** 1080p H.264 MP4. File size target under 500MB for YC upload.

**Why this order:** Screwups are isolated. If Raymond needs 6 takes on SHOT 5a, that does not affect Tris's schedule for SHOT 5b. The combined shot (5c) benefits from both founders being warmed up. Screen shots front-loaded because they have the most variables (live demo, dashboard state) and need to be confirmed clean before the founders spend energy on talking-head takes.

---

## What Raymond and Tris Need to Do Before Recording

### Raymond

1. Confirm `demo.pqsafe.xyz` is publicly accessible and the full sign-envelopes-pay sequence completes in under 13 seconds of screen time.
2. Confirm Python SDK is published to PyPI (or prepare a clean mock-mode terminal recording as backup, labelled "mock mode: Airwallex sandbox").
3. Confirm the Airwallex sandbox dashboard shows transfer `38873dbc-abfa-4ab5-be25-050496d4a0c3` and it is filterable. If the Airwallex production rail is live by April 30, swap to production dashboard and update voiceover to say "production" instead of "sandbox."
4. Do a dry run of the full script aloud before recording day. Time it. Decide whether to use the primary talking-head script or the condensed 8-second version — do not decide on recording day.
5. Charge iPhone to 100% and enable airplane mode during screen recording (except for the Airwallex dashboard tab — that needs live internet for the session cookie). Record screen separately on Mac.
6. Test lavalier mic levels in the recording room the day before. Confirm signal from both mics does not bleed.
7. Review the combined take sequence with Tris before recording day — know what SHOT 5c looks like so neither founder is surprised by the two-person framing.

### Tris

1. Read the full script at least once before recording day — not to memorize verbatim, but to know the structure and what Raymond covers so Tris's segment does not repeat it.
2. Confirm your lines the day before. Pick the primary or fallback version of CUE CARD 3. Do not leave this decision to recording day.
3. Review the SHOT 5c options (URL version vs joint-name version) and have a preference ready — saves time on set.
4. Wear the agreed shirt (navy or charcoal, confirmed with Raymond to avoid color clash) when you arrive for the shoot. Do not bring options to decide on the day.
5. Confirm tris@pqsafe.xyz email is active before recording day (needed for any post-video follow-up that references the founders directly).

### Both Founders (shared pre-recording checklist)

- Walk through the SHOT 5c framing together before the recording session starts — know where each person stands, how far apart, and where the camera is.
- Agree on which version of the close (Option A or Option B) is the preferred take, so you go into 5c with a clear default.
- Confirm all 4 URLs are live: `demo.pqsafe.xyz`, `pqsafe.xyz/handbook`, `github.com/PQSafe/pqsafe`, and the install commands (`pip install pqsafe`, `npm i @pqsafe/agent-pay`).
- Charge both phones fully. iPhone airplane mode during talking-head shots (no notifications mid-take).

---

## Version History

- **v1.0** (2026-04-18): Raymond-only, 6 shots, 15-second solo talking head. Baseline.
- **v2.0** (2026-04-18): Two founders. 7 shots. Raymond + Tris. Cue cards added. Recording order updated. Alternate dialog updated for joint close. Tris wardrobe and pre-recording checklist added.
