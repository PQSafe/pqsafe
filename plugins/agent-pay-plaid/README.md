# @pqsafe/agent-pay-plaid

Plaid Transfer API gated by PQSafe SpendEnvelope verification — ACH agent payments with post-quantum authorization.

## Why this exists

Plaid reaches bank accounts through its bank-link network via ACH — a distinct rail from Stripe's payment infrastructure. By integrating PQSafe's ML-DSA-65 signed SpendEnvelope authorization layer here, AI agents can execute ACH transfers over Plaid with post-quantum spend controls (amount caps, recipient allowlists, nonce-replay prevention, and audit logging) without any dependency on Stripe or other processors. This gives PQSafe a foothold in the Plaid segment of ACH agent payments where a competing payment-auth layer would need to build separate Plaid coverage to match.

## Install

```bash
npm install @pqsafe/agent-pay-plaid
```

Peer dependency:
```bash
npm install @pqsafe/agent-pay
```

## Quick start

```ts
import { createPlaidPQSafeClient } from '@pqsafe/agent-pay-plaid'
import { createEnvelope, signEnvelope } from '@pqsafe/agent-pay'

// 1. Issue a SpendEnvelope authorizing up to $500 via ACH
const envelope = createEnvelope({
  issuer: 'pq1' + myWalletAddress,
  agent: 'invoice-payment-agent-v1',
  maxAmount: 500,
  currency: 'USD',
  allowedRecipients: ['acct_routing_number_or_identifier'],
  ttlSeconds: 3600,
})
const signedEnvelope = signEnvelope(envelope, myMlDsaSecretKey, myMlDsaPublicKey)

// 2. Create a gated Plaid transfer
const client = createPlaidPQSafeClient({
  plaidClientId: process.env.PLAID_CLIENT_ID!,
  plaidSecret: process.env.PLAID_SECRET!,
  plaidEnv: 'sandbox',
})

const result = await client.protectedTransfer({
  envelope: signedEnvelope,
  authorizationId: 'plaid-auth-id-returned-by-authorization-create',
  amount: { currency: 'USD', value: '299.00' },
  description: 'Invoice 4421',
  ach_class: 'ppd',
  user: { legal_name: 'Jane Smith', email_address: 'jane@acme.com' },
  type: 'debit',
})

// 3. Inspect the result
console.log(result.transferId) // Plaid transfer ID
console.log(result.auditUrl)   // https://ledger.pqsafe.xyz/v1/entries/...
```

## Sandbox setup

1. Sign up at [plaid.com/dashboard](https://plaid.com/dashboard) and obtain a Sandbox `client_id` and `secret`.
2. Use Plaid's `/sandbox/processor_token/create` or Link flow to get an `access_token`.
3. Call `/transfer/authorization/create` with the access token to get an `authorization_id`.
4. Pass that `authorization_id` to `protectedTransfer`.

```bash
# .env (never commit)
PLAID_CLIENT_ID=your-sandbox-client-id
PLAID_SECRET=your-sandbox-secret
PQSAFE_TEST_MODE=true   # skip real API calls during dev
```

**Note:** The Plaid API call inside `protectedTransfer` is currently **stubbed** with a mock response. Replace the stub in `src/transfer.ts` (see the `TODO(raymond)` comment) with the real Plaid Node SDK call once you have sandbox credentials.

## API

### `createPlaidPQSafeClient(config)`

| Field | Type | Default | Description |
|---|---|---|---|
| `plaidClientId` | `string` | required | Plaid client_id |
| `plaidSecret` | `string` | required | Plaid secret |
| `plaidEnv` | `'sandbox' \| 'development' \| 'production'` | required | Plaid environment |
| `pqsafeApiUrl` | `string` | `https://api.pqsafe.xyz/v1` | PQSafe verification API |
| `pqsafeLedgerUrl` | `string` | `https://ledger.pqsafe.xyz/v1` | PQSafe audit ledger |
| `timeoutMs` | `number` | `30000` | Fetch timeout |

Returns `{ protectedTransfer, verifyPlaidWebhook }`.

### `client.protectedTransfer(input)`

Runs the 6-step authorization sequence before calling Plaid `/transfer/create`:

1. Verify SpendEnvelope ML-DSA-65 signature via `api.pqsafe.xyz/v1/mandates/verify`
2. Assert `amount.value ≤ envelope.maxAmount`
3. Check `authorizationId ∈ envelope.allowedRecipients` (best-effort; extend with your own recipient-resolution logic)
4. Nonce-replay guard via `api.pqsafe.xyz/v1/nonces/record`
5. Plaid `/transfer/create` (stubbed — wire real SDK)
6. Audit log entry to `ledger.pqsafe.xyz/v1/entries`

Throws `Error` on any guard failure. Callers should catch and surface to the issuing agent.

### `client.verifyPlaidWebhook(headers, body)`

Verify a Plaid inbound webhook:

1. Validate Plaid's RS256 JWT `Plaid-Verification` header (stubbed — wire `jose`)
2. Cross-reference the `transfer_id` in the body against the PQSafe audit log

Returns `{ valid, envelope_id?, webhook_type?, webhook_code? }`.

## Threat model

| Threat | Mitigation |
|---|---|
| Forged transfer request | ML-DSA-65 envelope signature verified before any Plaid call; invalid sig throws immediately |
| Replay attack (same envelope reused) | Nonce recorded at PQSafe `/nonces/record` before Plaid call; second use of same nonce is rejected |
| Amount overage | `amount.value ≤ maxAmount` enforced server-side before Plaid API call |
| Unauthorized recipient | `allowedRecipients` allowlist checked; empty list blocks all transfers |
| Envelope expiry bypass | `validUntil` field checked in both test and production paths |
| Quantum adversary forging signatures | ML-DSA-65 (NIST FIPS 204) — NIST Level 3 quantum-resistant; 3309-byte signatures |
| Plaid webhook spoofing | Plaid RS256 JWT header verification (stub provided; wire `jose` for production) |
| Audit log gap | Audit entry written before returning result; failure is logged but non-fatal |

## Signature sizes (NIST FIPS 204 — ML-DSA-65)

| Field | Size |
|---|---|
| Public key | 1952 bytes (3904 hex chars) |
| Secret key | 4032 bytes (8064 hex chars) |
| Signature | 3309 bytes (6618 hex chars) |

## TODOs for Raymond

- [ ] Wire real Plaid SDK in `src/transfer.ts` (see `TODO(raymond)` comment — install `plaid` npm package, replace `callPlaidTransferCreate` stub)
- [ ] Wire real JWT verification in `src/webhook.ts` (install `jose`, follow inline TODO)
- [ ] Add `/transfer/authorization/create` wrapper (pre-authorization step before `protectedTransfer`)
- [ ] Add `/transfer/event/sync` poller for event-driven reconciliation
- [ ] Add recipient-resolution logic mapping Plaid account IDs → `allowedRecipients` entries

## License

Apache-2.0 — see [LICENSE](../../LICENSE).

Plaid Node SDK (`plaid` npm package) is MIT licensed — compatible with Apache-2.0.

## Links

- [PQSafe docs](https://docs.pqsafe.xyz/agent-pay-plaid)
- [Plaid Transfer API](https://plaid.com/docs/api/products/transfer/)
- [clawhub.ai](https://clawhub.ai) — OpenClaw agent marketplace
- [NIST FIPS 204 (ML-DSA)](https://csrc.nist.gov/publications/detail/fips/204/final)
