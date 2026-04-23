# PQSafe — Virtual Card Architecture

**Purpose:** Enable AI agents to pay any SaaS service using a virtual Visa/Mastercard issued and controlled by PQSafe, with spend cap enforced at the card network level.

---

## Why Virtual Cards

PQSafe's current rail (Airwallex wire transfers) works for B2B bank-to-bank payments. But SaaS checkouts — Perplexity, OpenAI, Anthropic, Firecrawl, GitHub Copilot — expect a credit card number, not a wire transfer.

Virtual cards issued on demand solve this:
- Agent gets a real Visa PAN it can enter at any SaaS checkout
- Spend cap is enforced by the card network, not just PQSafe software
- Card is bound 1:1 to a `SpendEnvelope` — one agent, one purpose, one budget
- Card auto-expires when the envelope expires
- No real credit card is ever shared with the agent

---

## Primary Rail: Airwallex Virtual Card Issuing

### Availability

Airwallex offers a Card Issuing product (`/issuing` API) available in:
- Australia, UK, EU, Singapore, Hong Kong, USA (in beta/expansion)
- Supports Visa and Mastercard virtual cards
- Programmatic issuance via REST API
- Spend controls: per-transaction limits, merchant category controls, total balance caps
- Available on sandbox (demo.airwallex.com) for testing

**Conclusion: Airwallex Virtual Card Issuing is available programmatically. This is the primary implementation path.**

### API Shape

#### 1. Create a Cardholder (one per agent/user — can be reused)

```http
POST /api/v1/issuing/cardholders
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "INDIVIDUAL",
  "first_name": "PQSafe",
  "last_name": "Agent",
  "email": "agent@pqsafe.xyz",
  "date_of_birth": "1990-01-01",
  "address": {
    "city": "San Francisco",
    "country_code": "US",
    "postcode": "94105",
    "street_address": "1 Market St"
  }
}
```

Response:
```json
{
  "cardholder_id": "chd_abc123",
  "status": "ACTIVE"
}
```

#### 2. Issue a Virtual Card (one per SpendEnvelope)

```http
POST /api/v1/issuing/cards
Authorization: Bearer <token>
Content-Type: application/json

{
  "cardholder_id": "chd_abc123",
  "card_type": "VIRTUAL",
  "currency": "USD",
  "spend_controls": {
    "amount": 50.00,
    "period": "ALL_TIME",
    "currency": "USD",
    "transaction_limits": [
      { "amount": 50.00, "interval": "ALL_TIME" }
    ]
  },
  "expiry_month": "04",
  "expiry_year": "2027",
  "metadata": {
    "envelope_nonce": "<envelope.nonce>",
    "agent":          "<envelope.agent>",
    "issuer":         "<envelope.issuer>",
    "purpose":        "perplexity-pro-subscription"
  }
}
```

Response:
```json
{
  "card_id": "crd_xyz789",
  "status": "ACTIVE",
  "card_number": "4532901234567291",
  "expiry_month": "04",
  "expiry_year": "2027",
  "cvv": "391",
  "billing_address": { ... }
}
```

**Key fields:**
- `spend_controls.amount` maps directly to `envelope.maxAmount`
- `expiry_year/month` maps to `envelope.validUntil`
- `metadata.envelope_nonce` provides 1:1 traceability

#### 3. Retrieve Card Details (for secure delivery to agent)

```http
GET /api/v1/issuing/cards/{card_id}/pan
Authorization: Bearer <token>
```

Returns PAN, CVV. Should be treated as ephemeral — fetched once, used once, not stored.

#### 4. Cancel Card (on envelope revocation)

```http
POST /api/v1/issuing/cards/{card_id}/deactivate
Authorization: Bearer <token>
```

PQSafe calls this when:
- Human revokes the envelope
- `envelope.validUntil` is reached
- Agent reports task complete

---

## PQSafe Integration: `issueVirtualCard(signedEnvelope)`

New SDK function to be added to `agent-pay/src/rails/airwallex.ts`:

```typescript
export interface VirtualCardResult {
  cardId:     string
  pan:        string
  last4:      string
  expiry:     string   // "MM/YY"
  cvv:        string
  spendCap:   number
  currency:   string
  envelopeNonce: string
}

export async function issueVirtualCard(
  signed: SignedEnvelope,
): Promise<VirtualCardResult> {
  // 1. verifyEnvelope — same guard rails as executeAgentPayment
  const envelope = verifyEnvelope(signed)

  // 2. Get/create cardholder for this issuer (cached by issuer address)
  const cardholderId = await getOrCreateCardholder(envelope.issuer)

  // 3. POST /issuing/cards with spend_controls from envelope
  const token = await getAccessToken()
  const expiryDate = new Date(envelope.validUntil * 1000)

  const res = await fetch(`${getAirwallexBaseUrl()}/issuing/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      cardholder_id: cardholderId,
      card_type: 'VIRTUAL',
      currency: envelope.currency,
      spend_controls: {
        amount: envelope.maxAmount,
        period: 'ALL_TIME',
        currency: envelope.currency,
      },
      expiry_month: String(expiryDate.getMonth() + 1).padStart(2, '0'),
      expiry_year:  String(expiryDate.getFullYear()),
      metadata: {
        envelope_nonce: envelope.nonce,
        agent:          envelope.agent,
        issuer:         envelope.issuer,
      },
    }),
  })

  const card = await res.json()

  // 4. Fetch PAN (separate call — Airwallex returns sensitive data on demand)
  const panRes = await fetch(`${getAirwallexBaseUrl()}/issuing/cards/${card.card_id}/pan`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const { card_number, cvv } = await panRes.json()

  return {
    cardId:        card.card_id,
    pan:           card_number,
    last4:         card_number.slice(-4),
    expiry:        `${card.expiry_month}/${String(card.expiry_year).slice(2)}`,
    cvv,
    spendCap:      envelope.maxAmount,
    currency:      envelope.currency,
    envelopeNonce: envelope.nonce,
  }
}
```

---

## Fallback Rail: Stripe Issuing

If Airwallex Issuing is not available in a given jurisdiction, Stripe Issuing is the fallback.

### Stripe Issuing API Shape

```http
POST /v1/issuing/cardholders
POST /v1/issuing/cards
```

**Create a cardholder:**
```json
{
  "name": "PQSafe Agent",
  "email": "agent@pqsafe.xyz",
  "status": "active",
  "type": "individual",
  "billing": { "address": { "line1": "1 Market St", "city": "San Francisco", "state": "CA", "postal_code": "94105", "country": "US" } }
}
```

**Issue a virtual card:**
```json
{
  "cardholder": "ich_xxx",
  "currency": "usd",
  "type": "virtual",
  "spending_controls": {
    "spending_limits": [{ "amount": 5000, "interval": "all_time" }]
  },
  "metadata": { "envelope_nonce": "<nonce>", "agent": "<agent>" }
}
```

Note: Stripe amounts are in **cents** (5000 = $50.00). Airwallex uses decimal dollars.

**Retrieve card number:**
```http
GET /v1/issuing/cards/{id}
Stripe-Version: 2024-06-20
```

Returns `number`, `cvc`, `exp_month`, `exp_year` in response.

### Stripe vs Airwallex comparison

| Feature | Airwallex Issuing | Stripe Issuing |
|---|---|---|
| Spend cap enforcement | Network level | Network level |
| Metadata on card | Yes | Yes |
| Programmatic issuance | Yes | Yes |
| Sandbox availability | Yes | Yes |
| Jurisdictions | AU, UK, EU, SG, HK, US (beta) | US, UK, EU |
| PQSafe existing integration | Yes (OAuth, transfers) | Partial |
| Preferred | **Primary** | Fallback |

---

## SpendEnvelope → Virtual Card Mapping

| SpendEnvelope field | Virtual Card field |
|---|---|
| `maxAmount` | `spend_controls.amount` (Airwallex) / `spending_limits[0].amount` (Stripe) |
| `validUntil` | `expiry_year` + `expiry_month` |
| `nonce` | `metadata.envelope_nonce` |
| `agent` | `metadata.agent` |
| `issuer` | `metadata.issuer` (maps to cardholder) |
| `currency` | `currency` |

---

## Security Properties

1. **One card per envelope.** An agent cannot get two cards from one envelope.
2. **Spend cap is network-enforced.** Even if PQSafe software is compromised, Airwallex will decline charges over `maxAmount`.
3. **No PAN storage.** PQSafe fetches the PAN once and delivers it to the agent in-memory. It is never stored in the ledger.
4. **Instant revocation.** `POST /issuing/cards/{id}/deactivate` kills the card in real-time.
5. **Merchant controls (future).** Airwallex supports MCC (Merchant Category Code) restrictions. This allows locking a card to a specific merchant category (e.g., "SaaS software only").
6. **PQ-signed authorization.** The issuance call itself is gated by `verifyEnvelope()` — the ML-DSA-65 signature must pass before any card is issued.

---

## Implementation Plan

| Sprint | Work |
|---|---|
| Sprint 1 (current) | Design complete, demo uses simulated VCN |
| Sprint 2 | Implement `issueVirtualCard()` with Airwallex sandbox |
| Sprint 3 | Add `cancelVirtualCard()` on envelope expiry/revocation |
| Sprint 4 | Add merchant MCC controls per `allowedRecipients` |
| Sprint 5 | Stripe Issuing fallback rail |

---

## References

- Airwallex Issuing API: https://www.airwallex.com/docs/api#/Issuing/Cards/post_api_v1_issuing_cards
- Airwallex Card Controls: https://www.airwallex.com/docs/api#/Issuing/Cards/Spend_Controls
- Stripe Issuing: https://stripe.com/docs/issuing
- NIST FIPS 204 (ML-DSA): https://doi.org/10.6028/NIST.FIPS.204
