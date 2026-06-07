# PQSafe Site Reposition — Residual Off-Message Sweep
Generated: 2026-06-08
Scope: `*.html`, `*.md`, `*.tsx` — excludes `node_modules/`, `.next/`, `docs/api/`

---

## Term-by-term findings

### 1. `virtual Visa` / `issues a virtual` / `routes the payment`
**Hits: 0**
Verdict: CLEAN — no occurrences anywhere in scope.

---

### 2. `全球首个`
**Hits: 1**
File: `plugins/claude-pqsafe/skills/pqsafe-pay/SKILL.md` line 116
Content: `- Don't claim "global first" / 全球首个 — Alipay AI Pay shipped Apr 21 2026`

Verdict: **ACCEPTABLE — forbidden-terms guard, not a live claim.**
This is the AI skill's internal truth-guard section instructing Claude NOT to use the phrase. The phrase appears as the thing to avoid, not as a claim on the public site. No user-facing page contains it.

---

### 3. `world-first` / `world's first`
**Hits: 0**
Verdict: CLEAN.
Note: `plugins/claude-pqsafe/skills/pqsafe-pay/SKILL.md` line 117 contains `"world's only PQ payment skill"` as a forbidden claim guard (same truth-guard section as above) — same verdict: acceptable dev-doc, not a live claim.

---

### 4. `permission slip`
**Hits: 0**
Verdict: CLEAN.

---

### 5. `spending money`
**Hits: 0**
Verdict: CLEAN.

---

### 6. `ClawHub`
**Hits: multiple — all acceptable**

| File | Line | Context | Verdict |
|---|---|---|---|
| `landing/index.md` | 195 | "not published on ClawHub" | Acceptable — correct disclaimer |
| `landing/claude-skill/index.html` | 7, 12, 24, 405, 414, 739 | All `ClawHavoc` supply-chain attack narrative referencing ClawHub as the compromised registry | Acceptable — factual threat-narrative, correctly frames PQSafe as the response |
| `landing/openclaw-skill/index.html` | 7, 12, 24, 421, 425, 430, 634 | Same ClawHavoc attack narrative; line 425 says "50,000+ tools in its ClawHub registry" describing OpenClaw's registry (not PQSafe's listing) | Acceptable — accurate description of OpenClaw ecosystem + PQSafe not claiming to be listed there |
| `landing/spec/ap2-pq-v1/index.html` | 1372 | "not published on ClawHub" | Acceptable — correct disclaimer |
| `plugins/claude-pqsafe/commands/pqsafe-create.md` | 64 | "do NOT reference ClawHub (PQSafe is not published there)" | Acceptable — dev instruction guard |
| `plugins/claude-pqsafe/skills/pqsafe-pay/SKILL.md` | 113 | "Do NOT claim PQSafe is published on ClawHub" | Acceptable — truth-guard |

**No instance claims PQSafe is published on or endorsed by ClawHub.**

---

### 7. `QClaw`
**Hits: 0**
Verdict: CLEAN.

---

### 8. `ECDSA-only`
**Hits: 1**
File: `landing/spec/ap2-pq-v1/index.html` line 1110
Content: `<tr><td>Phase 3: PQ-Only</td><td>2027-01</td><td>MUST use ML-DSA-65 only</td><td>MAY reject ECDSA-only</td></tr>`

Verdict: **ACCEPTABLE — accurate dev/spec content.**
This is inside the AP2-PQ migration roadmap table, in the "verifier SHOULD/MAY" column. It accurately describes the 2027 PQ-Only phase where verifiers may reject legacy ECDSA-only signatures. This is a factual technical spec statement about the migration timeline, not a marketing claim. Correct to leave.

---

### 9. `501-byte`
**Hits: 0**
Verdict: CLEAN.

---

## Summary

| Term | Hits | Real residual? |
|---|---|---|
| virtual Visa | 0 | No |
| 全球首个 | 1 (forbidden-terms guard) | No — acceptable |
| world-first | 0 | No |
| permission slip | 0 | No |
| spending money | 0 | No |
| issues a virtual | 0 | No |
| routes the payment | 0 | No |
| ClawHub | multiple | No — all accurate threat-narrative or explicit "not published" disclaimers |
| QClaw | 0 | No |
| ECDSA-only | 1 (spec table) | No — accurate technical spec |
| 501-byte | 0 | No |

**Total real residual problems: 0**

---

## READY TO PUSH

**YES — no blockers.**

All hits are either zero occurrences on live pages, or appear exclusively inside:
- Internal AI skill truth-guard / forbidden-claim lists (SKILL.md, pqsafe-create.md)
- Accurate factual threat-narrative (ClawHavoc attack, ClawHub as victim registry)
- Accurate technical spec content (ECDSA-only migration table in AP2-PQ spec)
- Explicit "not published on ClawHub" disclaimers

No public user-facing page makes any of the forbidden claims.
