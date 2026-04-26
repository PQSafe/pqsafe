# Wise Sandbox — Real Transfer Demo

**Goal:** produce a real Wise sandbox transfer ID from `api.sandbox.transferwise.tech`, signed with ML-DSA-65, in under 15 minutes.

## Status

Pending Raymond running the demo. See DEMO_RECEIPTS.md for receipt placeholder.

---

## Step 1 — Create a Wise sandbox account (5 min)

1. Go to https://sandbox.transferwise.tech
2. Click **Sign up** — use any email (the sandbox is separate from live accounts)
3. Complete the minimal registration form (no KYC required for sandbox)
4. Verify your email → log in to the sandbox dashboard

Alternatively, if you already have a Wise live account:
- Log in at https://wise.com → Settings → Developer tools → API tokens
- Switch environment to **Sandbox** (there should be a toggle or a separate sandbox app)

## Step 2 — Create a sandbox API token (2 min)

1. In the sandbox dashboard: **Settings → API tokens → Add token**
2. Name: `pqsafe-agentpay-demo`
3. Click **Create** → copy the token immediately (shown once)
4. Note your **Profile ID** (visible in Settings → Profile, or returned by `GET /v1/profiles`)

## Step 3 — Fund the sandbox balance (2 min)

Wise sandbox accounts need a balance to fund transfers.

1. Sandbox dashboard → **Balances → Add money** (or "Top up")
2. Add **USD 100** (virtual money, no cost)
3. Confirm the balance appears before running the demo

## Step 4 — Populate ~/.pqsafe-wise.env (2 min)

```bash
# Create the env file (chmod 600 — no secrets in git)
cat > ~/.pqsafe-wise.env << 'EOF'
# Wise Sandbox Credentials
# DO NOT commit this file
WISE_SANDBOX_KEY=your_wise_sandbox_api_token_here
WISE_PROFILE_ID=your_wise_profile_id_here

# Sandbox recipient — the IBAN to send test funds to
# Wise sandbox accepts any valid IBAN format for testing
# Default used if not set: GB29NWBK60161331926819
WISE_TEST_RECIPIENT=GB29NWBK60161331926819
EOF

chmod 600 ~/.pqsafe-wise.env
```

Replace the placeholder values with your actual sandbox credentials.

**WISE_PROFILE_ID** can be found by calling:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.sandbox.transferwise.tech/v1/profiles
```
The `id` field from the BUSINESS profile entry is your profile ID.

## Step 5 — Run the demo (2 min)

```bash
cd ~/Projects/pqsafe/agent-pay
npx tsx demo/wise-sandbox-demo.ts
```

Expected output (last section):
```
  Step 5  Execute payment — Wise sandbox
  ────────────────────────────────────────────────────────────────────────
  Rail                   wise
  Amount                 1 GBP
  Recipient              GB29NWBK60161331926819

  Transfer ID            12345678
  Amount                 1 GBP
  Executed at            2026-04-26T10:00:00.000Z
  Mock                   false
  ✓ Payment executed. Add this Transfer ID to DEMO_RECEIPTS.md.

Verify at:
  https://sandbox.transferwise.tech → Transfers → ID: 12345678
```

## Step 6 — Add to DEMO_RECEIPTS.md

Once you have a real transfer ID, add it to DEMO_RECEIPTS.md under the Wise section.

---

## Troubleshooting

| Error | Meaning | Fix |
|---|---|---|
| `WISE_SANDBOX_KEY not set` | Env file missing or wrong key name | Check `~/.pqsafe-wise.env` has `WISE_SANDBOX_KEY=...` |
| `Wise: no profiles found` | API key doesn't match any profile | Re-check token in sandbox dashboard |
| `PQSafe/Wise: INSUFFICIENT_FUNDS` | Sandbox balance is 0 | Top up via sandbox dashboard (Step 3) |
| `PQSafe/Wise: INVALID_RECIPIENT` | IBAN not accepted | Wise sandbox accepts standard IBANs — try `GB29NWBK60161331926819` |
| `Wise API error (401)` | Invalid API token | Re-copy token from sandbox dashboard |
| `Wise API error (403)` | Token lacks transfer permissions | Create new token with full permissions |
| `Wise API error (422)` | Quote/transfer creation failed | Check balance, recipient IBAN format |

## How the code works

The demo uses `src/rails/wise.ts` with real API calls (no mocks):

1. **GET /v1/profiles** → fetch your business profile ID
2. **POST /v3/quotes** → create a quote (source GBP, target GBP, 1 unit)
3. **POST /v1/accounts** → create a recipient account with the IBAN
4. **POST /v3/profiles/{profileId}/transfers** → create the transfer (links quote + recipient)
5. **POST /v3/profiles/{profileId}/transfers/{id}/payments** → fund the transfer from balance

The transfer ID from step 4 is the `txId` in the `PaymentResult` — this is what you add to DEMO_RECEIPTS.md.

## Verify the transfer

After running the demo:
- Log in to https://sandbox.transferwise.tech
- Navigate to **Transfers**
- Search for the transfer ID printed by the demo
- Status should be `processing` or `outgoing_payment_sent`

Or via API:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://api.sandbox.transferwise.tech/v3/profiles/YOUR_PROFILE_ID/transfers/TRANSFER_ID"
```

## Estimated time

| Step | Time |
|---|---|
| Create sandbox account | 5 min |
| Get API token + profile ID | 2 min |
| Fund sandbox balance | 2 min |
| Populate .env file | 2 min |
| Run demo + get transfer ID | 1 min |
| **Total** | **~12 min** |
