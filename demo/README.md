# PQSafe AgentPay — Browser Demo

One-page browser demo for [PQSafe AgentPay](https://pqsafe.xyz).  
Live at: **demo.pqsafe.xyz**

## What it does

Click one button → watch a real ML-DSA-65 signed payment flow in ~12 seconds:

1. Real ML-DSA-65 keypair generated in-browser (via @noble/post-quantum, NIST FIPS 204)
2. SpendEnvelope built field-by-field
3. Real ML-DSA-65 signature over the envelope JSON
4. Stub Airwallex call (returns recorded sandbox UUID `38873dbc-abfa-4ab5-be25-050496d4a0c3`)
5. Transfer card shown with verify link to DEMO_RECEIPTS.md

No build step. No install. Single HTML file.

## Deploy to Cloudflare Pages (drag-drop)

1. Go to [Cloudflare Pages](https://pages.cloudflare.com/)
2. Click **Create application → Pages → Upload assets**
3. Drag-drop the `demo/` folder (just `index.html` is enough)
4. Set project name: `pqsafe-demo`
5. Click **Deploy**
6. Add custom domain: `demo.pqsafe.xyz`

## Deploy via Wrangler CLI

```bash
# Install wrangler if needed
npm i -g wrangler

# One-time: login
wrangler login

# Deploy
cd ~/Projects/pqsafe/demo
wrangler pages deploy . --project-name pqsafe-demo
```

## Deploy via GitHub Actions (recommended for CI)

```yaml
- name: Deploy to Cloudflare Pages
  uses: cloudflare/pages-action@v1
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    projectName: pqsafe-demo
    directory: demo
```

## File sizes

| File         | Size     |
|--------------|----------|
| `index.html` | ~14 KB   |

Crypto libraries are loaded from `esm.sh` CDN on first load then cached by the browser:

| Library                          | Approx size (gzip) |
|----------------------------------|--------------------|
| `@noble/post-quantum@0.2.1`      | ~140 KB            |
| `@noble/hashes@1.5.0`            | ~8 KB              |

Total page weight (HTML only, before crypto libs): well under 200 KB.

## Cryptography

- **NOT mocked.** `ml_dsa65.keygen()` and `ml_dsa65.sign()` are called directly in the browser.
- Library: [@noble/post-quantum](https://github.com/paulmillr/noble-post-quantum) — pure JS, no WASM, audited.
- Standard: NIST FIPS 204 (ML-DSA-65)
- The Airwallex transfer in step 4 is a **recorded sandbox receipt** to keep the demo browser-only. Real payments run via `npm run demo` — see [DEMO_RECEIPTS.md](../agent-pay/DEMO_RECEIPTS.md).

## Real production demo

```bash
cd ~/Projects/pqsafe/agent-pay
export AIRWALLEX_CLIENT_ID=<your id>
export AIRWALLEX_API_KEY=<your key>
export AIRWALLEX_ENV=demo
npm run demo
```
