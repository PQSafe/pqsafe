# x402 Protocol Demo — HTTP 402 Payment Required

**Goal:** demonstrate the x402 end-to-end handshake with a local mock server, showing how PQSafe AgentPay handles gated HTTP resources that require micropayments.

## What is x402?

The x402 protocol (https://x402.org) extends HTTP with native payment semantics:

```
Client                          Server
  |                               |
  |  GET /api/resource            |
  |------------------------------>|
  |                               |
  |  402 Payment Required         |
  |  X-Payment-Requirements: ...  |
  |<------------------------------|
  |                               |
  | (client constructs payment)   |
  |                               |
  |  GET /api/resource            |
  |  X-Payment: <proof>           |
  |------------------------------>|
  |                               |
  |  200 OK + resource body       |
  |<------------------------------|
```

PQSafe integrates x402 via ML-DSA-65 signed spend envelopes — the agent verifies the payment requirements against the envelope before executing any payment.

---

## Quick Start

### Run both server + client (recommended)

```bash
cd ~/Projects/pqsafe/agent-pay
npx tsx demo/x402-demo.ts
```

This starts the mock server on port 4402 and immediately runs the client demo.

### Run server and client separately

**Terminal 1 — start the server:**
```bash
cd ~/Projects/pqsafe/agent-pay
npx tsx demo/x402-demo.ts --server-only
```

**Terminal 2 — run the client:**
```bash
cd ~/Projects/pqsafe/agent-pay
npx tsx demo/x402-demo.ts --client-only
```

### Just the mock server (for manual testing)

```bash
npx tsx demo/x402-mock-server/server.ts
```

Then test manually:
```bash
# Probe the resource (expect 402)
curl -i http://localhost:4402/api/resource

# Free resource (expect 200)
curl http://localhost:4402/api/free

# Server status
curl http://localhost:4402/api/status
```

---

## Expected Output

```
PQSafe AgentPay — x402 Protocol Demo
ML-DSA-65 • NIST FIPS 204 • HTTP 402 Payment Required

  Server                 http://localhost:4402
  Resource               http://localhost:4402/api/resource

────────────────────────────────────────────────────────────────────────
  Step 1  Generate post-quantum keypair
────────────────────────────────────────────────────────────────────────
  Scheme                 ML-DSA-65 (NIST FIPS 204)
  Public key             1952 bytes
  PQSafe addr            pq1a3e33...
  ✓ Keypair generated

────────────────────────────────────────────────────────────────────────
  Step 2  Probe endpoint (expect HTTP 402)
────────────────────────────────────────────────────────────────────────
  HTTP status            402 Payment Required
  Scheme                 exact
  Network                base-sepolia
  Token                  0x036CbD53842c5426634e7929541eC2318f3dCF7e
  Amount                 1000000
  Recipient              0xffff...
  ✓ Payment requirements parsed from X-Payment-Requirements header

────────────────────────────────────────────────────────────────────────
  Step 3  Build + sign spend envelope
────────────────────────────────────────────────────────────────────────
  Max amount             1.01 USDC
  Required               1 USDC
  Signature              3309 bytes (ML-DSA-65)
  ✓ Envelope signed + verified

────────────────────────────────────────────────────────────────────────
  Step 4  Construct payment proof
────────────────────────────────────────────────────────────────────────
  txHash (mock)          0x1234abcd...
  Amount                 1000000
  To                     0xffff...
  Timestamp              1745680000
  Header length          152 chars (base64url)
  ✓ Payment proof constructed

────────────────────────────────────────────────────────────────────────
  Step 5  Retry request with X-Payment header (expect 200)
────────────────────────────────────────────────────────────────────────
  HTTP status            200 OK
  Resource data          premium_content
  Access tier            premium
  ✓ Resource accessed successfully via x402 payment proof
```

---

## Mock Server API Reference

**Base URL:** `http://localhost:4402`

### GET /api/resource

x402-gated resource. Requires valid `X-Payment` header.

**Without payment:**
```
HTTP/1.1 402 Payment Required
X-Payment-Requirements: <base64url JSON>
Content-Type: application/json

{
  "error": "payment_required",
  "requirements": {
    "scheme": "exact",
    "network": "base-sepolia",
    "tokenAddress": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "amount": "1000000",
    "to": "0xffff...ffff",
    "maxTimeoutSeconds": 300
  }
}
```

**With valid X-Payment header:**
```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "data": "premium_content",
  "resource": { "tier": "premium", "content": "..." },
  "payment": { "txHash": "...", "verifiedAt": "..." }
}
```

### GET /api/free

No payment required. Always returns 200.

### GET /api/status

Server status and configuration.

---

## X-Payment Header Format

The `X-Payment` header is a base64url-encoded JSON object:

```json
{
  "scheme": "exact",
  "txHash": "0x...",
  "amount": "1000000",
  "to": "0xffff...ffff",
  "timestamp": 1745680000
}
```

Encode with:
```ts
Buffer.from(JSON.stringify(proof)).toString('base64url')
```

Decode with:
```ts
JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))
```

---

## Connecting to a Real x402 Server

Replace the mock server URL with any real x402-compatible endpoint:

```ts
import { requestResource, signPayment, retryWithPayment } from '@pqsafe/agent-pay'

// 1. Probe
const { requirements } = await requestResource('https://api.example.com/premium')

// 2. Execute real USDC payment (see USDC_SEPOLIA.md)
const txHash = await executeUsdcTransfer(requirements)

// 3. Construct proof + retry
const proof = signPayment(requirements, txHash)
const { body } = await retryWithPayment('https://api.example.com/premium', proof)
```

---

## Production Architecture

In production, the x402 flow integrates with the USDC-Base rail:

```
Agent                    x402 Server          Base Sepolia
  |                          |                     |
  |  requestResource()       |                     |
  |------------------------->|                     |
  |  402 + requirements      |                     |
  |<-------------------------|                     |
  |                          |                     |
  |  executePayment (USDC)  ---------------------->|
  |  txHash <------------------------------ receipt|
  |                          |                     |
  |  retryWithPayment(proof) |                     |
  |------------------------->|                     |
  |  200 OK + content        |                     |
  |<-------------------------|                     |
```

See `src/rails/x402.ts` and `src/rails/usdc-base.ts` for implementation details.

---

## Estimated time

| Step | Time |
|---|---|
| Run full demo (no setup needed) | 30 sec |
| Read the x402 server code | 5 min |
| Understand the protocol flow | 5 min |
| **Total** | **~10 min** |
