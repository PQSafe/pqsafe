# Stripe Test Mode — Real PaymentIntent Demo

**Goal:** produce a real Stripe test-mode Payment Intent ID (`pi_...`) from `api.stripe.com`, signed with ML-DSA-65, in under 10 minutes.

## Status

Pending Raymond running the demo. See DEMO_RECEIPTS.md for receipt placeholder.

---

## Step 1 — Get a Stripe test-mode secret key (3 min)

1. Go to https://dashboard.stripe.com → log in (or create a free account)
2. **Important:** ensure you are in **Test mode** — toggle in the top-right corner of the dashboard
3. Navigate to **Developers → API keys**
4. Copy the **Secret key** — it starts with `sk_test_`
5. Do NOT use a live key (`sk_live_`) — that charges real money

If you don't have a Stripe account:
1. Sign up at https://stripe.com (free, no credit card required for test mode)
2. Skip the business verification — test mode works immediately
3. Go to Developers → API keys → copy `sk_test_...`

## Step 2 — Populate ~/.pqsafe-stripe.env (1 min)

```bash
cat > ~/.pqsafe-stripe.env << 'EOF'
# Stripe Test Mode Credentials
# DO NOT commit this file
STRIPE_TEST_KEY=sk_test_your_key_here
EOF

chmod 600 ~/.pqsafe-stripe.env
```

Replace `sk_test_your_key_here` with your actual test-mode secret key.

## Step 3 — Run the demo (2 min)

```bash
cd ~/Projects/pqsafe/agent-pay
npx tsx demo/stripe-sandbox-demo.ts
```

Expected output (key sections):
```
  Step 2a  Create Stripe PaymentMethod (test card 4242...)
  ────────────────────────────────────────────────────────────────────────
  PaymentMethod ID       pm_1Abc123...
  ✓ Test card PaymentMethod created

  Step 2b  Create PaymentIntent with envelope metadata
  ────────────────────────────────────────────────────────────────────────
  Payment Intent ID      pi_3Abc456...
  ✓ PaymentIntent created

  Step 5  Confirm PaymentIntent (real Stripe test charge)
  ────────────────────────────────────────────────────────────────────────
  Payment Intent ID      pi_3Abc456...
  Status                 succeeded
  Amount                 $10.00 USD
  Mock                   false — real Stripe test charge
  ✓ Payment confirmed. Add this Payment Intent ID to DEMO_RECEIPTS.md.

Verify at:
  https://dashboard.stripe.com/test/payments/pi_3Abc456...
```

## Step 4 — Add to DEMO_RECEIPTS.md

Once you have a real `pi_...` ID, add it to DEMO_RECEIPTS.md under the Stripe section.

---

## Verify the charge

After running the demo:
1. Log in to https://dashboard.stripe.com
2. Ensure **Test mode** is toggled ON
3. Navigate to **Payments**
4. Find the payment with the `pi_...` ID from the demo output
5. Status should be **Succeeded**

Or via API:
```bash
curl -H "Authorization: Bearer sk_test_YOUR_KEY" \
  "https://api.stripe.com/v1/payment_intents/pi_YOUR_PI_ID"
```

---

## How the code works

The demo directly calls Stripe's API (no Stripe SDK dependency):

1. **POST /v1/payment_methods** — create a PaymentMethod with test card `4242 4242 4242 4242`
2. **POST /v1/payment_intents** — create a PaymentIntent for $10 USD with:
   - `metadata.pqsafe_envelope_hash` — keccak16 of the spend envelope (binding)
   - `metadata.pqsafe_agent` — agent identifier
   - `metadata.pqsafe_issuer` — ML-DSA-65 PQSafe address
3. Build the spend envelope with the real `pi_...` ID in the allowlist
4. Sign the envelope with ML-DSA-65, verify on the agent side
5. **POST /v1/payment_intents/{id}/confirm** — confirm the payment

The `pi_...` ID returned is permanent — visible in your Stripe dashboard forever.

## Test cards

Stripe provides many test card numbers for different scenarios:

| Card | Behavior |
|---|---|
| 4242 4242 4242 4242 | Succeeds |
| 4000 0000 0000 9995 | Declined (insufficient funds) |
| 4000 0000 0000 0002 | Declined (generic) |
| 4000 0025 0000 3155 | 3D Secure required |

The demo uses `4242 4242 4242 4242` (always succeeds).

## Troubleshooting

| Error | Meaning | Fix |
|---|---|---|
| `STRIPE_TEST_KEY not set` | Env file missing | Check `~/.pqsafe-stripe.env` has `STRIPE_TEST_KEY=sk_test_...` |
| `does not start with sk_test_` | Using live key | Switch to test mode in Stripe dashboard |
| `Stripe API error (401)` | Invalid API key | Re-copy from Developers → API keys |
| `Stripe API error (402): card_declined` | Test card declined | Use card `4242 4242 4242 4242` |
| `payment_intent not in requires_confirmation` | PI already confirmed | Create a fresh run (each run creates a new PI) |
| `No such payment_intent` | PI ID mismatch | Ensure you're in the same Stripe account/test-mode |

## Estimated time

| Step | Time |
|---|---|
| Get Stripe test API key | 3 min |
| Populate .env file | 1 min |
| Run demo + get pi_ ID | 1 min |
| **Total** | **~5 min** |
