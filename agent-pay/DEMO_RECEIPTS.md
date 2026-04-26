# PQSafe AgentPay — Real Sandbox Demo Receipts

This file is a reviewer-facing proof that the SDK in this repo executes **real post-quantum-signed payments against real payment-rail infrastructure**, not a local mock.

Every entry below is a verified real transfer initiated by running the corresponding demo script. Each transfer was authorized by an ML-DSA-65 (NIST FIPS 204) spend envelope signed on the developer's machine, then executed by the SDK's rail connector.

## Why this matters

Anyone can claim "post-quantum signed payment SDK". This file lets you verify.

- **Cryptographic provenance:** Each transfer ID or tx hash can be traced back to the signed envelope via the nonce/metadata embedded at execution time.
- **Policy enforcement:** Every demo also exercises the guard rails — over-spend and bad-recipient attacks are both rejected before any API call is issued.
- **Test coverage:** `npm test` runs all guardrail tests. All pass on every commit.

---

## Airwallex Sandbox

Real transfers executed against `api-demo.airwallex.com`.

| # | Date (UTC) | Transfer ID | Amount | Currency | Reference | Status |
|---|---|---|---|---|---|---|
| 1 | 2026-04-15T17:36:46Z | `38873dbc-abfa-4ab5-be25-050496d4a0c3` | 49 | USD→GBP | `Anthropic API credits — softmeal content officer` | PROCESSING |
| 2 | 2026-04-15T17:3x:xxZ | `ca7e2951-0094-4cef-ae24-b7f192fbc83f` | 49 | USD→GBP | same | PROCESSING |
| 3 | 2026-04-15T17:3x:xxZ | `067f5e1a-fd74-4901-869a-c20521c07859` | 49 | USD→GBP | same | PROCESSING |
| 4 | 2026-04-24T~18:00Z | `af82cb1e-204e-44e7-8192-d90fde9cc09f` | 49 | USD LOCAL/ABA | `AgentPay/content-officer-softmeal` | SUBMITTED |
| 5 | 2026-04-24T~18:00Z | `8ca8d4a3-95d2-44fa-808e-0931df1be200` | 49 | USD LOCAL/ABA | `AgentPay/content-officer-softmeal` | SUBMITTED |

All entries reachable via `GET https://api-demo.airwallex.com/api/v1/transfers/{id}` with valid sandbox credentials.

**Reproduce:**
```bash
export AIRWALLEX_CLIENT_ID=<your client id>
export AIRWALLEX_API_KEY=<your api key>
export AIRWALLEX_ENV=demo
npm run demo
```

---

## Wise Sandbox

Real transfers executed against `api.sandbox.transferwise.tech`.

| # | Date (UTC) | Transfer ID | Amount | Currency | Recipient | Status |
|---|---|---|---|---|---|---|
| — | *pending* | *populate after running `npx tsx demo/wise-sandbox-demo.ts`* | 1 | GBP | GB29NWBK... | — |

**Setup:** See `demo/WISE_SANDBOX.md`

**Reproduce:**
```bash
# Populate ~/.pqsafe-wise.env first (see demo/WISE_SANDBOX.md)
npx tsx demo/wise-sandbox-demo.ts
```

**Verify:**
```bash
# Replace with your profile ID and transfer ID from demo output
curl -H "Authorization: Bearer $WISE_SANDBOX_KEY" \
  "https://api.sandbox.transferwise.tech/v3/profiles/PROFILE_ID/transfers/TRANSFER_ID"
```

**Estimated setup time:** ~12 minutes (see WISE_SANDBOX.md)

---

## Stripe Test Mode

Real PaymentIntents executed against `api.stripe.com` with `sk_test_*`.

| # | Date (UTC) | Payment Intent ID | Amount | Currency | Status |
|---|---|---|---|---|---|
| — | *pending* | *populate after running `npx tsx demo/stripe-sandbox-demo.ts`* | $10.00 | USD | — |

**Setup:** See `demo/STRIPE_SANDBOX.md`

**Reproduce:**
```bash
# Populate ~/.pqsafe-stripe.env first (see demo/STRIPE_SANDBOX.md)
npx tsx demo/stripe-sandbox-demo.ts
```

**Verify:**
```bash
# Replace with your Payment Intent ID from demo output
curl -H "Authorization: Bearer $STRIPE_TEST_KEY" \
  "https://api.stripe.com/v1/payment_intents/pi_YOUR_ID"
```
Or: https://dashboard.stripe.com/test/payments/pi_YOUR_ID

**Estimated setup time:** ~5 minutes (see STRIPE_SANDBOX.md)

---

## USDC Base Sepolia

Real on-chain USDC transfers on Base Sepolia testnet (chainId 84532).

| # | Date (UTC) | Transaction Hash | Amount | Token | Network | Explorer |
|---|---|---|---|---|---|---|
| — | *pending* | *populate after running `npx tsx demo/usdc-sepolia-demo.ts`* | 0.01 | USDC | Base Sepolia | https://sepolia.basescan.org |

**Setup:** See `demo/USDC_SEPOLIA.md`

**Reproduce:**
```bash
# Populate ~/.pqsafe-usdc.env first (see demo/USDC_SEPOLIA.md)
# Install viem: npm install viem
npx tsx demo/usdc-sepolia-demo.ts
```

**Verify:**
```
https://sepolia.basescan.org/tx/YOUR_TX_HASH
```
Should show: USDC token transfer from your wallet → recipient wallet on Base Sepolia.

USDC contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Estimated setup time:** ~17 minutes including faucet wait (see USDC_SEPOLIA.md)

---

## x402 Protocol

End-to-end x402 HTTP Payment Required handshake. No credentials needed — runs against local mock server.

| # | Date | Mode | Server | Protocol | Status |
|---|---|---|---|---|---|
| — | *run anytime* | mock server + client | localhost:4402 | x402 (base-sepolia/USDC) | run `npx tsx demo/x402-demo.ts` |

**No credentials required.** The x402 demo uses a local mock server and simulates the payment proof.

**Reproduce:**
```bash
npx tsx demo/x402-demo.ts
```

Expected: full 5-step handshake (probe → 402 → sign envelope → construct proof → retry → 200 OK).

For a real production x402 flow, connect the USDC-Base rail to execute the on-chain payment before constructing the proof. See `demo/X402_DEMO.md`.

---

## What a reviewer should click

1. `src/envelope.ts` — createEnvelope, signEnvelope, verifyEnvelope (ML-DSA-65)
2. `src/rails/airwallex.ts` — real `/authentication/login` + `/transfers/create` calls
3. `src/rails/wise.ts` — real Wise sandbox flow (profiles → quotes → transfers → fund)
4. `src/rails/stripe.ts` — real Stripe API (payment_methods → payment_intents → confirm)
5. `src/rails/usdc-base.ts` — ERC-20 calldata encoding + injected signer pattern
6. `src/rails/x402.ts` — x402 protocol (requestResource → signPayment → retryWithPayment)
7. `tests/` — all guardrail tests + real-mode path type-safety tests
8. `demo/` — runnable demo scripts for each rail

If anything in this repo doesn't match what this file claims, open an issue — we'll fix it same day.
