# Chrome Web Store Listing — PQSafe Wallet

## Upload package
`pqsafe-extension-v0.1.0.zip` (built from `extension/dist/`)

---

## Name (max 45 chars)
PQSafe — Post-Quantum Crypto Wallet

## Summary (max 132 chars)
The first crypto wallet protected by NIST post-quantum standards. ML-DSA-65 signatures and ML-KEM-768 key encapsulation.

## Category
Productivity

## Language
English (primary). Simplified Chinese copy available on pqsafe.xyz.

---

## Detailed description

PQSafe is the world's first crypto wallet built on NIST's post-quantum cryptography standards. While every mainstream wallet today — MetaMask, Phantom, Rabby — still signs transactions with ECDSA, which Shor's algorithm will break on a sufficiently large quantum computer, PQSafe uses the lattice-based primitives standardized in FIPS 203 and FIPS 204.

Why this matters now, not later:

• Harvest-now, decrypt-later. Adversaries are already recording encrypted traffic and on-chain data, waiting for the day a large enough quantum computer exists to break ECDSA. Anything you sign today is permanently exposed to that future attack.
• NIST finalized the post-quantum standards in 2024. The algorithms are ready. Most wallets haven't shipped them.
• PQSafe uses audited implementations from @noble/post-quantum, the same library trusted by other production cryptographic projects.

What's inside:

• ML-DSA-65 (FIPS 204) — lattice-based digital signatures, NIST Security Level 3
• ML-KEM-768 (FIPS 203) — lattice-based key encapsulation, NIST Security Level 3
• Create wallet, view public key, sign arbitrary messages
• Keys stored locally in chrome.storage.local — nothing ever leaves your browser
• Manifest V3, service-worker background, modern React UI
• 100% open source (MIT) — github.com/PQSafe/pqsafe

PQSafe is early software. It is a working proof that post-quantum wallet primitives can run today in a browser extension. We are not a custodian, we do not hold keys, and we do not currently sign transactions for any specific chain — this is a signing tool for PQ messages, not a drop-in MetaMask replacement. Use at your own risk.

Learn more at https://pqsafe.xyz.

---

## Permissions justification (for CWS review)

• `storage` — required to persist the user's PQ key pair and wallet metadata in chrome.storage.local. No remote storage, no sync.
• `clipboardWrite` — required so users can copy their public key / address to the clipboard from the Dashboard view.

No host permissions. No content scripts. No remote code. No analytics. No network calls.

---

## Single purpose

PQSafe's single purpose is to let a user create, hold, and sign with a post-quantum key pair (ML-DSA-65) inside their browser, and to demonstrate ML-KEM-768 key encapsulation. Everything in the extension supports that purpose.

---

## Privacy policy (host on pqsafe.xyz/privacy)

PQSafe does not collect, transmit, store, or share any personal data. All cryptographic material is generated and kept inside the user's browser via chrome.storage.local. The extension makes no network requests. There is no telemetry, no analytics, no remote logging.

---

## Links
• Website: https://pqsafe.xyz
• Source: https://github.com/PQSafe/pqsafe
• Support: hello@pqsafe.xyz

---

## Assets checklist

- [x] Icon 128×128 (in extension package)
- [x] Store icon 512×512 — `icon512.png`
- [x] Small promo tile 440×280 — `promo_small_440x280.png`
- [x] Screenshot 1 (hero) 1280×800 — `screenshot_1_hero_1280x800.png`
- [x] Screenshot 2 (specs) 1280×800 — `screenshot_2_specs_1280x800.png`
- [x] Screenshot 3 (why) 1280×800 — `screenshot_3_why_1280x800.png`
- [x] Screenshot 4 (Welcome popup) 1280×800 — `screenshot_4_welcome_1280x800.png`
- [x] Screenshot 5 (Dashboard popup) 1280×800 — `screenshot_5_dashboard_1280x800.png`
- [x] Screenshot 6 (Sign Message popup) 1280×800 — `screenshot_6_sign_1280x800.png`
- [x] Privacy policy page hosted at https://pqsafe.xyz/privacy/
- [ ] Developer account registered ($5 one-time fee) — NEEDS RAYMOND

---

## Pre-submit TODO

1. ~~Take popup screenshots~~ — done (mocked from React source, pixel-accurate)
2. ~~Add `/privacy/` to landing~~ — done, live at https://pqsafe.xyz/privacy/
3. **Register CWS developer account** (hello@pqsafe.xyz), pay $5 — NEEDS RAYMOND
4. **Upload** `pqsafe-extension-v0.1.0.zip` — NEEDS RAYMOND
5. **Paste listing fields** from this doc — NEEDS RAYMOND
