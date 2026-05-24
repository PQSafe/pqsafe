# PQSafe · MP demo — `landing/mp-demo/`

A single-file, self-contained web demo for the MiraclePlus Fall 2026 application:
**"An AI agent pays its own SaaS bill — and a quantum computer still can't forge it."**

## What it does (all real, nothing mocked)
- Builds a **SpendEnvelope** using the exact `agent-pay` schema (issuer `pq1…`, agent, maxAmount, currency, allowedRecipients, validFrom/Until, nonce).
- Canonicalizes it with **RFC 8785 JCS**, signs with **ML-DSA-65 (NIST FIPS 204)** via `@noble/post-quantum` (loaded from esm.sh; same scheme as the SDK).
- Counterparty **verifies** in one step → green VALID.
- **Tamper** button flips `maxAmount` 149 → 9999, re-verifies against the original signature → red INVALID (payload hash mismatch). Restore → green again.
- Verified live in-browser: pubkey 1952 B, signature 3309 B (the real FIPS-204 ML-DSA-65 sizes); original verify = true, tampered verify = false.

## Run locally
Open `index.html` in any modern browser (needs internet to fetch the FIPS-204 lib from CDN). The badge reads **"crypto: ML-DSA-65 ready"** when the self-test passes.

## Deploy (to pqsafe.xyz/mp-demo or a subdomain)
It's a static file — serve `landing/mp-demo/` via the existing Cloudflare Pages pipeline (same as the rest of `landing/`). Suggested URL: `pqsafe.xyz/mp-demo/`. For an investor-safe live demo, optionally vendor `@noble/post-quantum` locally instead of esm.sh so it works with zero network.

## Record the MP video from this
This page IS the 90-second product demo (agent 27 storyboard). Single-take screen capture:
1. QuickTime → New Screen Recording → select the browser region.
2. Press **Run autonomous payment** → wait for ✓ VALID.
3. Press **Tamper** → hold 2 s on the red ✕ INVALID.
4. Press **Restore** → green.
5. Trim, export 1080p MP4. Captions per `27_video_demo_storyboard.md`.

Maintainer: Asaptic (HK) Limited · pqsafe.xyz
