# @pqsafe/cli

Command-line tool for PQSafe issuers — create, sign, verify, and revoke ML-DSA-65 SpendEnvelopes without writing TypeScript.

## Quick start

```bash
npm install -g @pqsafe/cli       # or: npx pqsafe ...
pqsafe keygen                    # one-time setup — generates ~/.pqsafe/issuer_v1_keypair.json
pqsafe issue --agent travel-bot --max 100 --currency USD --recipients alice,bob
pqsafe verify ./pqsafe-envelope-travel-bot-1715000000.json
pqsafe verify --api ./pqsafe-envelope-travel-bot-1715000000.json
```

## Commands

### `pqsafe keygen [--name v2]`

Generate a new ML-DSA-65 issuer keypair (NIST FIPS 204 Level 3).

Saves to `~/.pqsafe/issuer_<name>_keypair.json` with mode `0600`. Run once.
The public key is 1,952 bytes; the signature it produces is 3,309 bytes.

```bash
pqsafe keygen           # saves issuer_v1_keypair.json (default)
pqsafe keygen --name v2 # saves issuer_v2_keypair.json
```

### `pqsafe issue`

Create and sign a SpendEnvelope.

```bash
pqsafe issue \
  --agent travel-agent-v1 \
  --max 100 \
  --currency USD \
  --recipients alice,bob \
  --ttl 3600 \
  --key v1 \
  -o my-envelope.json
```

**Options:**

| Flag | Required | Description |
|---|---|---|
| `--agent` | Yes | Agent identifier (string) |
| `--max` | Yes | Maximum spend amount |
| `--currency` | Yes | Currency code (e.g. USD, HKD) |
| `--recipients` | Yes | Comma-separated recipient IDs |
| `--ttl` | No | Validity in seconds (default: 3600) |
| `--rail` | No | Payment rail identifier |
| `--key` | No | Keypair name to use (default: v1) |
| `-o` | No | Output file path |

**Output:**

```
Issued SpendEnvelope:
  Agent:      travel-agent-v1
  Issuer:     pq1aaaa1234567890
  Max:        100 USD
  Recipients: 2 entries
  Valid:      2026-05-05T12:34:56Z → 2026-05-05T13:34:56Z (1h)
  Signature:  ML-DSA-65 (3,309 bytes)
  Public key: a1b2c3d4e5f6… (fingerprint 8a1fe313…)

Saved to: ./pqsafe-envelope-travel-agent-v1-1715000000.json
Verify:   pqsafe verify ./pqsafe-envelope-travel-agent-v1-1715000000.json
Revoke:   pqsafe revoke ./pqsafe-envelope-travel-agent-v1-1715000000.json
```

### `pqsafe verify [--api] <envelope.json>`

Verify a SpendEnvelope.

```bash
pqsafe verify envelope.json         # local ML-DSA-65 verify (no network)
pqsafe verify --api envelope.json   # POST to https://api.pqsafe.xyz/v1/mandates/verify
```

Local verification is instant and works offline. API verification additionally checks revocation status.

### `pqsafe revoke <envelope.json> [--reason "..."]`

Revoke a SpendEnvelope via the PQSafe API.

```bash
REVOKE_API_KEY=your-key pqsafe revoke envelope.json --reason agent_compromised
```

Requires the `REVOKE_API_KEY` environment variable.

### `pqsafe audit <audit-id>`

Look up an audit log entry.

```bash
pqsafe audit evt_abc123
```

## Environment variables

| Variable | Description |
|---|---|
| `PQSAFE_API_URL` | Override API base URL (default: `https://api.pqsafe.xyz`). Use `https://pqsafe-api-production.raymond-thu87.workers.dev` while DNS propagates. |
| `PQSAFE_TEST_MODE` | Set to `true` to skip real signing (placeholder signature). Matches Worker stub-mode behavior. |
| `REVOKE_API_KEY` | Bearer token for the revocation endpoint. |

## Threat model

SpendEnvelopes are authorization tokens for AI agent payments. The security properties are:

**Post-quantum signatures.** ML-DSA-65 (NIST FIPS 204 Level 3) provides ~192-bit security against both classical and quantum adversaries. Signatures are 3,309 bytes; public keys are 1,952 bytes.

**JCS canonicalization.** The envelope payload is serialized to JSON Canonical Form (RFC 8785) before hashing. This prevents signature-stripping attacks where an attacker reorders JSON keys to produce a byte-identical payload with a different structure.

**SHA-256 pre-hash.** The signer computes `SHA-256(JCS(payload))` and signs the digest, matching the PQSafe Worker verifier exactly. Do not sign raw payload bytes.

**Offline key storage.** The issuer secret key lives only at `~/.pqsafe/issuer_<name>_keypair.json` (mode `0600`). It is never bundled with this package, never transmitted to any API, and never logged.

**Revocation.** Revoked envelopes are checked by `pqsafe verify --api`. Local-only verification cannot detect revocation.

## License compatibility

`@noble/post-quantum` is MIT licensed. This package is Apache-2.0. The combination is permissive and compatible.

## License

Apache-2.0 — Copyright 2024 PQSafe. See [LICENSE](./LICENSE).
