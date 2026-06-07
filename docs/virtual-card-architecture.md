# PQSafe — Virtual Card Authorization Architecture

> **⚠️ SUPERSEDED — Architecture restatement (2026-06-08)**
> PQSafe is an **authorization and audit layer**, not a card issuer. PQSafe does NOT implement `/issuing/cards`; no card issuance code exists in this repo. The current demo uses a simulated VCN (nonce-derived last-4 label, mock mode). If/when a licensed rail such as Airwallex or Stripe is integrated, **that rail issues the card** — PQSafe signs and verifies the SpendEnvelope mandate (cap, payee scope, expiry, revocable, auditable) that authorizes the rail to do so. See the SpendEnvelope authorization model below. The API shapes documented here are **rail-side reference specs**, not PQSafe-implemented endpoints.

---

**Purpose:** Define how a SpendEnvelope mandate authorizes a licensed payment rail to provision a virtual card for an AI agent, with spend cap and revocation controlled by PQSafe's authorization layer.

---

## Authorization Model

PQSafe's role is to sign and verify a `SpendEnvelope` mandate before any payment action occurs. The SpendEnvelope encodes:

- `maxAmount` — the spend cap the agent may not exceed
- `validUntil` — expiry of the authorization
- `allowedRecipients` — payee scope (which merchants/services are permitted)
- `nonce` — one-time unique identifier for auditability
- `agent` / `issuer` — parties bound by the mandate
- ML-DSA-65 signature (FIPS 204) — post-quantum tamper-evident seal

**PQSafe authorizes and audits; a licensed rail moves the money.**

When a virtual card is warranted (e.g., SaaS checkout that requires a card number), the flow is:

1. PQSafe verifies the ML-DSA-65 SpendEnvelope signature.
2. PQSafe calls the licensed rail's issuing API — the **rail** creates and owns the card.
3. The rail enforces the spend cap at the network level (independent of PQSafe software).
4. On envelope revocation or expiry, PQSafe instructs the rail to deactivate the card.
5. All authorization events are logged in PQSafe's audit trail.

---

## Why Virtual Cards (Use-Case Context)

PQSafe's current rail (Airwallex wire transfers) works for B2B bank-to-bank payments. But SaaS checkouts — Perplexity, OpenAI, Anthropic, Firecrawl, GitHub Copilot — expect a card number, not a wire transfer.

If a virtual card rail is integrated:
- The agent receives a card number provisioned by the rail (not by PQSafe) to enter at SaaS checkout
- Spend cap is enforced by the card network, not just PQSafe software — defense-in-depth
- The card is bound 1:1 to a `SpendEnvelope` — one agent, one purpose, one budget
- Card auto-expires when the envelope expires
- No real credit card is ever shared with the agent

**Current status (Sprint 1):** Demo uses a simulated VCN (nonce-derived label). No live card issuance is implemented. Sprints 2–5 below describe the planned integration path with the rail acting as issuer.

---

## Primary Rail Reference: Airwallex Card Issuing API

> These are **Airwallex's** API endpoints. PQSafe would call these on the rail's behalf after verifying the SpendEnvelope. PQSafe does not expose these endpoints itself.

### Availability

Airwallex offers a Card Issuing product (`/issuing` API) available in:
- Australia, UK, EU, Singapore, Hong Kong, USA (in beta/expansion)
- Supports Visa and Mastercard virtual cards
- Programmatic issuance via REST API
- Spend controls: per-transaction limits, merchant category controls, total balance caps
- Available on sandbox (demo.airwallex.com) for testing

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

#### 2. Issue a Virtual Card (one per SpendEnvelope — issued by Airwallex, authorized by PQSafe envelope)

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
- `metadata.envelope_nonce` provides 1:1 traceability back to the PQSafe audit log

#### 3. Retrieve Card Details (for secure delivery to agent)

```http
GET /api/v1/issuing/cards/{card_id}/pan
Authorization: Bearer <token>
```

Returns PAN, CVV. Should be treated as ephemeral — fetched once, used once, not stored by PQSafe.

#### 4. Cancel Card (on envelope revocation)

```http
POST /api/v1/issuing/cards/{card_id}/deactivate
Authorization: Bearer <token>
```

PQSafe instructs the rail to deactivate when:
- Human revokes the envelope
- `envelope.validUntil` is reached
- Agent reports task complete

---

## PQSafe SDK: Planned `authorizeVirtualCard(signedEnvelope)` Function

> **Not yet implemented.** This documents the planned integration shape for Sprint 2. The function name is `authorizeVirtualCard` (not `issueVirtualCard`) to reflect that PQSafe's role is authorization, not issuance.

Planned addition to `agent-pay/src/rails/airwallex.ts`:

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

/**
 * PQSafe verifies the SpendEnvelope mandate, then calls the Airwallex rail to
 * provision a virtual card. Airwallex is the card issuer; PQSafe is the
 * authorization and audit layer.
 */
export async function authorizeVirtualCard(
  signed: SignedEnvelope,
): Promise<VirtualCardResult> {
  // 1. verifyEnvelope — ML-DSA-65 signature check; same guard rails as executeAgentPayment
  const envelope = verifyEnvelope(signed)

  // 2. Get/create cardholder on the rail for this issuer (cached by issuer address)
  const cardholderId = await getOrCreateCardholder(envelope.issuer)

  // 3. Call Airwallex POST /issuing/cards — Airwallex issues the card
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

  // 4. Fetch PAN from rail (separate call — Airwallex returns sensitive data on demand)
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

## Fallback Rail Reference: Stripe Issuing API

> Stripe Issuing is the fallback if Airwallex is not available in a given jurisdiction. Same model: Stripe issues the card; PQSafe's SpendEnvelope governs the authorization.

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

**Issue a virtual card (Stripe issues; PQSafe authorizes via envelope):**
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

| SpendEnvelope field | Rail card field |
|---|---|
| `maxAmount` | `spend_controls.amount` (Airwallex) / `spending_limits[0].amount` (Stripe) |
| `validUntil` | `expiry_year` + `expiry_month` |
| `nonce` | `metadata.envelope_nonce` |
| `agent` | `metadata.agent` |
| `issuer` | `metadata.issuer` (maps to cardholder on the rail) |
| `currency` | `currency` |

---

## Security Properties

1. **One card per envelope.** An agent cannot get two cards from one envelope — the SpendEnvelope nonce is a one-time key.
2. **Spend cap is network-enforced by the rail.** Even if PQSafe software is compromised, Airwallex/Stripe will decline charges over `maxAmount` — defense-in-depth independent of PQSafe.
3. **No PAN storage.** PQSafe fetches the PAN from the rail once and delivers it to the agent in-memory. It is never stored in the PQSafe ledger.
4. **Instant revocation.** PQSafe calls `POST /issuing/cards/{id}/deactivate` on the rail in real-time on envelope revocation.
5. **Merchant controls (future).** Airwallex supports MCC (Merchant Category Code) restrictions. This allows locking a card to a specific merchant category (e.g., "SaaS software only"), enforced by the rail.
6. **PQ-signed authorization.** The SDK issues a signed SpendEnvelope before any payment call — the ML-DSA-65 (FIPS 204) signature must pass `verifyEnvelope()` before PQSafe instructs the rail to act.

---

## Implementation Plan

| Sprint | Work |
|---|---|
| Sprint 1 (current) | Authorization model designed; demo uses simulated VCN (nonce-derived label, no live card issuance) |
| Sprint 2 | Implement `authorizeVirtualCard()` calling Airwallex sandbox — Airwallex issues card |
| Sprint 3 | Add `revokeVirtualCard()` on envelope expiry/revocation (calls rail deactivate) |
| Sprint 4 | Add merchant MCC controls per `allowedRecipients` — enforced at rail level |
| Sprint 5 | Stripe Issuing fallback rail |

---

## References

- Airwallex Issuing API: https://www.airwallex.com/docs/api#/Issuing/Cards/post_api_v1_issuing_cards
- Airwallex Card Controls: https://www.airwallex.com/docs/api#/Issuing/Cards/Spend_Controls
- Stripe Issuing: https://stripe.com/docs/issuing
- NIST FIPS 204 (ML-DSA): https://doi.org/10.6028/NIST.FIPS.204
