# @pqsafe/conformance

Standalone conformance test harness for the **AP2-PQ profile** — the dual-signature payment mandate standard that pairs ECDSA-P256 with ML-DSA-65 (NIST FIPS 204 Level 3, 3,309-byte signature). Any rail integrator (Stripe, Airwallex, Plaid, or anyone claiming AP2-PQ compatibility) can run this harness to certify their ML-DSA-65 implementation against the six canonical PQSafe test vectors, including the critical negative vector that guards against the `pqcrypto 0.4.0` silent-accept exposure.

---

## Install

```bash
npm install --save-dev @pqsafe/conformance
```

---

## Quick start

**1. Implement the `Verifier` interface** in a `.js` or `.mjs` file:

```js
// my-verifier.js
import { mlDsa65 } from '@noble/post-quantum/ml-dsa'

export default {
  async verify({ publicKey, message, signature }) {
    try {
      const valid = mlDsa65.verify(publicKey, message, signature)
      return { valid }
    } catch (err) {
      return { valid: false, reason: err.message }
    }
  }
}
```

**2. Run the harness:**

```bash
npx pqsafe-conformance --impl ./my-verifier.js
```

**Expected output (all 6 passing):**

```
TAP version 14
1..6
# AP2-PQ Conformance — vectors from https://pqsafe.xyz/spec/ap2-pq-test-vectors-v1.json
# pubkey fingerprint: f9b83d417d6d92b9
# run at: 2026-05-05T...

ok 1 - tc1-minimal — positive: Minimal 5-field mandate verifies
ok 2 - tc2-array-ordering — positive: Array ordering preserved
ok 3 - tc3-numeric-types — positive: Numeric types handled
ok 4 - tc4-unicode — positive: Unicode fields preserved
ok 5 - tc5-large-payload — positive: Large payload verifies
ok 6 - tc1-neg-tampered-payload — negative: tampered payload rejected

# All 6 tests passed
```

---

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--impl <path>` | (required) | Path to your `Verifier` implementation module |
| `--fixtures-url <url>` | `https://pqsafe.xyz/spec/ap2-pq-test-vectors-v1.json` | Override the test-vector URL |
| `--json` | off | Output machine-readable JSON instead of TAP |

---

## Library API

```ts
import { runConformance } from '@pqsafe/conformance'
import type { Verifier } from '@pqsafe/conformance'

const myVerifier: Verifier = { /* ... */ }

const report = await runConformance(myVerifier, {
  fixturesUrl: 'https://pqsafe.xyz/spec/ap2-pq-test-vectors-v1.json', // optional
})

console.log(`${report.passed}/${report.total} passed`)
```

### `Verifier` interface

```ts
interface Verifier {
  verify(input: {
    publicKey: Uint8Array  // 1952 bytes — ML-DSA-65 FIPS 204 Level 3
    message:   Uint8Array  // JCS-canonicalised mandate payload
    signature: Uint8Array  // 3309 bytes
  }): Promise<{ valid: boolean; reason?: string }>
}
```

---

## GitHub Actions — drop this into your repo

Copy this workflow file to certify your implementation on every PR:

```yaml
# .github/workflows/pqsafe-conformance.yml
name: AP2-PQ Conformance

on:
  pull_request:
  push:
    branches: [main]

jobs:
  conformance:
    name: AP2-PQ conformance (ML-DSA-65)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Run AP2-PQ conformance harness
        run: npx pqsafe-conformance --impl ./src/my-verifier.js

      # Optional: save JSON report as an artifact
      - name: Save JSON report
        if: always()
        run: npx pqsafe-conformance --impl ./src/my-verifier.js --json > conformance-report.json

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: conformance-report
          path: conformance-report.json
```

---

## Test vectors

Six vectors are published at `https://pqsafe.xyz/spec/ap2-pq-test-vectors-v1.json`:

| ID | Type | What it tests |
|----|------|---------------|
| `tc1-minimal` | positive | Standard 5-field mandate envelope verifies |
| `tc2-array-ordering` | positive | JCS array ordering is stable |
| `tc3-numeric-types` | positive | Numeric field handling |
| `tc4-unicode` | positive | Unicode field values |
| `tc5-large-payload` | positive | Large mandate payload |
| `tc1-neg-tampered-payload` | **negative** | Tampered payload must be **rejected** — guards against the `pqcrypto 0.4.0` silent-accept exposure |

The negative vector is the most important: any implementation that accepts it has a critical security flaw.

---

## Spec reference

- **Profile**: AP2-PQ (not "AP2 standard" — AP2-PQ is a PQSafe-defined profile)
- **Algorithm**: ML-DSA-65 per [NIST FIPS 204](https://csrc.nist.gov/pubs/fips/204/final) Level 3
- **Signature size**: 3,309 bytes (canonical, fixed for ML-DSA-65)
- **Public key size**: 1,952 bytes
- **Serialisation**: JCS ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)) — JSON Canonicalisation Scheme
- **License**: Apache-2.0

---

## Notes for integrators

- This harness is **implementation-agnostic** — it works with any ML-DSA-65 library
- The harness does **not** perform the ECDSA-P256 half of the AP2-PQ dual-signature; it tests ML-DSA-65 only
- Exit code `0` = all tests passed; `1` = one or more failed; `2` = fatal error
- TAP output is compatible with `tap-spec`, `tap-parser`, `jest --reporters tap`, and GitHub Actions

---

*Published by [PQSafe](https://pqsafe.xyz) · Apache-2.0*
