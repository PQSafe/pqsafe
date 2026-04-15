# Airwallex Sandbox — ship the first real signed payment

**Goal:** by **2026-04-28**, produce one screen recording of a real Airwallex sandbox transfer executed end-to-end through `executeAgentPayment()`, showing the transaction ID in the Airwallex dashboard. This is the only binary deliverable for the YC S26 video.

Everything else (ML-DSA-65 signing, envelope verification, guardrails, router) already passes 13/13 tests and runs clean in mock mode — `npm run demo` on this machine already works. The only thing missing is real credentials hitting the real sandbox endpoint.

---

## Step 1 — Create the Airwallex sandbox account (5 min)

1. Go to <https://www.airwallex.com/docs/api> → "Try the API in the sandbox"
2. Sign up with a business email. Use `raymond@seniordeli.com` — this is the operating email already tied to Raymond's Carewells entity, which is the most plausible "business profile" for a sandbox account.
3. Airwallex sandbox is free and does not require KYC for API testing. You should land in the sandbox dashboard within a few minutes.
4. If the sandbox signup is blocked by account-type gating, fall back to: Dashboard → Settings → Developer → API Keys inside an existing live account and request sandbox access from the same screen.

## Step 2 — Fetch sandbox credentials (2 min)

Inside the sandbox dashboard:

1. Developer → **API keys**
2. Click **Create API key** → copy **Client ID** and **API key**
3. Treat these like production secrets. Do **NOT** paste them into code, chat, commit history, or any file in this repo.

## Step 3 — Fund the sandbox balance (3 min)

Airwallex sandbox accounts start empty and `/transfers/create` will return `insufficient_funds` if the wallet has no balance. The SDK already maps this to `PQSafe/Airwallex: INSUFFICIENT_FUNDS` so you'll see a clear error.

1. Sandbox dashboard → **Balances** → **Top up** (or "Add funds to sandbox")
2. Top up **USD 500** (any amount ≥ $300 is fine — sandbox top-ups are free virtual money)
3. Confirm the USD balance shows as available before running the demo.

## Step 4 — Add a sandbox beneficiary (3 min)

The demo sends to `GB29NWBK60161331926819` (a fake GB IBAN). Airwallex sandbox will accept this for SWIFT test transfers, but if you want an Airwallex-native recipient:

1. Dashboard → **Recipients** → **Add recipient**
2. Type: **Bank account**, Currency: **USD**, Country: **United Kingdom**
3. Account number: `GB29NWBK60161331926819`
4. Name: `PQSafe Test Supplier`
5. Save and copy the resulting beneficiary ID if needed.

If the demo's hardcoded IBAN is rejected, edit `examples/agentpay_demo.ts` line ~127 (`const RECIPIENT = ...`) to use an IBAN you've added as a beneficiary.

## Step 5 — Run the real demo (2 min)

From this directory (`~/Projects/pqsafe/agent-pay/`):

```bash
export AIRWALLEX_CLIENT_ID='paste-client-id-here'
export AIRWALLEX_API_KEY='paste-api-key-here'
export AIRWALLEX_ENV='sandbox'

npm run demo
```

Expected output:

```
Mode                LIVE SANDBOX
...
Step 5  Execute payment — guard-railed & routed
  Transaction ID    tr_sbx_<real-airwallex-id>
  Mode              real sandbox
  ✓ Payment executed. The agent paid its own Anthropic bill.
```

That transaction ID is the single most important string in the entire YC application.

## Step 6 — Capture the screen recording (5 min)

This is the 20 seconds of footage inside the 60-second founder video that everything else supports.

1. **Shot 1 (terminal)** — record `npm run demo` running. The PQSafe keypair/envelope/signature/verify/execute steps should print cleanly. Hold on the `Transaction ID` line for 2 seconds.
2. **Shot 2 (browser)** — cut to `https://demo.airwallex.com/app/transfers` → find the transfer with the matching `tr_sbx_*` ID from Shot 1 → click it → show the detail view (amount, status, beneficiary).
3. **Shot 3 (face)** — you, one line, camera direct: *"PQSafe AgentPay. My AI agent just paid a supplier, signed with a post-quantum signature, routed through Airwallex, and I never logged in."*

Record with QuickTime (⌘⇧5) at 1080p. Don't edit. Don't add music. Raw is fine — YC explicitly says production value doesn't matter.

## Troubleshooting

| Error | Meaning | Fix |
|---|---|---|
| `Airwallex auth failed (401): invalid_credentials` | Client ID or API key wrong | Re-copy from dashboard; make sure no trailing whitespace |
| `Airwallex auth failed (403): account_inactive` | Sandbox account not yet verified | Wait ~5 min after signup, or check dashboard for a "verify email" banner |
| `PQSafe/Airwallex: INSUFFICIENT_FUNDS` | Sandbox balance is $0 | Top up via dashboard (Step 3) |
| `PQSafe/Airwallex: INVALID_RECIPIENT` | IBAN not recognized by sandbox | Add it as a beneficiary (Step 4) or swap the IBAN in `examples/agentpay_demo.ts` |
| `PQSafe/Airwallex: COMPLIANCE_BLOCK` | Sandbox compliance check tripped | Change `reason: 'goods_purchase'` in `src/rails/airwallex.ts` to `'service_charge'` and retry |
| Generic 400 / 500 | API change upstream | Log the full `errBody` by editing `src/rails/airwallex.ts` `createTransfer` to `console.error(errBody)` once — patch back before committing |

## Rollback plan if Step 1–5 blocks you before 2026-04-28

If sandbox account creation is blocked (account type, KYC, corporate-email gating) and you cannot get real credentials by **2026-04-26**, fall back to this:

1. Record the demo in mock mode (`PQSAFE_MOCK_MODE=1 npm run demo`). Everything else — keypair, signing, verification, guardrails, routing — is real; only the final wire call to Airwallex is mocked. The video narration says: *"Airwallex sandbox integration ships the week after this video. The signing and verification layer is production-real — here's the test suite."* Then switch to Shot 2 running `npm test` showing 13/13 passing.
2. This is strictly weaker than a real transaction ID. Only use it if Step 1 is truly blocked. Spend the saved time on warm YC intros instead.

## Why this is the single thing that matters

The YC reviewer has seen 500 AI-payment decks. What they have **not** seen:

- A post-quantum-signed authorization envelope
- Routed through a real fiat rail
- Executed by an agent that cannot exceed its policy
- Demoed live with a real transaction ID
- By a founder who also runs 8 real companies that need exactly this

Every other asset (website, application essay, competition table, slide deck) is supporting fire for those 20 seconds of footage. Protect the 15-hour dev budget for this and nothing else.
