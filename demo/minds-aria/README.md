# PQSafe × Minds — Aria Demo

Investor demo for **"Aria, the Guild Treasury Mind"** — a live 7-beat walkthrough of PQSafe post-quantum spend authorization, built for the Animoca / Yat Siu pitch.

---

## Running it

```bash
cd /Users/tun/Projects/pqsafe/demo/minds-aria
python3 -m http.server 3000
```

Then open **http://localhost:3000** in Chrome or Safari.

Works via `file://` too (open `index.html` directly) — all assets are local, no CDN dependencies.

---

## Pointing at a real adapter

Edit the **Adapter base URL** input in the top-right corner of the page. Default is `http://localhost:8000`.

The app POSTs to `{base}/api/minds/authorize-spend` for beats 1, 3, 4, and 5.

Request body shape:
```json
{
  "mind_id": "aria",
  "agent_id": "aria-treasury",
  "merchant": "0x...",
  "amount": 480,
  "currency": "USDC",
  "memo": "...",
  "policy": {
    "whitelist": ["0xCA57eF", "0xVENUE123", "0xVENDOR456"],
    "per_tx_limit": 500,
    "human_approval_threshold": 500,
    "valid_secs": 3600
  },
  "human_approved": false,
  "_tamper_amount": 4800
}
```

---

## The 7 beats

| Beat | Name | What it shows |
|------|------|---------------|
| **0** | Set policy | Owner configures spend rules; Aria acknowledges with PQSafe enforcement |
| **1** | Valuable pay | Whitelisted 480 USDC payment → approved receipt |
| **2** | Money meter | Per-authorization fee economics ($0.012/auth × 47 = $0.564/mo) |
| **3** | Injection blocked | Prompt injection attempt to override policy → blocked by PQSafe, not by LLM reasoning |
| **4** | Tamper caught | ML-DSA-65 signed envelope altered 480→4800 → SIGNATURE_INVALID detected |
| **5** | Human approval | 1,200 USDC exceeds 500 threshold → Aria pauses, owner approves in-page |
| **6** | Moat receipt | Full cryptographic audit trail: envelope hash, policy hash, dual sigs, Arbitrum Sepolia tx |
| **7** | Distribution | Authorization Guard is now a shareable Bazaar Skill; Nova already installed it |

---

## Offline fallback

If the adapter is unreachable (any network error, timeout, or HTTP error), the app falls back to bundled canned responses and shows an amber badge:

> ⚡ offline fallback — decisions normally computed live by the PQSafe adapter

No live call is ever silently faked — the badge is always shown when using fallback data.

---

## Stage-fallback use

This page **is** the stage fallback. If the adapter goes down mid-demo:

1. The amber badge appears automatically.
2. All 7 beats still run with correct canned responses.
3. The right panel renders exactly as it would with live data.
4. No manual intervention needed.

---

## Architecture

```
index.html   — layout, beat buttons, two-column shell
styles.css   — all styling (dark fintech + PQ lattice motif)
app.js       — BEATS config array, attemptAdapterCall(), renderPanel(), chat helpers
```

No build step, no npm, no CDN. Open and present.
