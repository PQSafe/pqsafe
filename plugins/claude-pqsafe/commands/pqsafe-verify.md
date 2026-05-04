---
description: Verify a PQSafe SpendEnvelope — checks ML-DSA-65 signature, expiry, allowlist, replay-protection, and revocation status
argument-hint: <path-to-envelope.json | envelope-id>
allowed-tools: Bash, Read, WebFetch
---

# /pqsafe-verify — Verify a SpendEnvelope

You are verifying a previously-issued SpendEnvelope. The user invoked `/pqsafe-verify` with: `$ARGUMENTS`.

## Steps

1. **Resolve the envelope**:
   - If `$ARGUMENTS` looks like a file path → `Read` it and parse JSON.
   - If it looks like an envelope ID (hex-only) → fetch from `https://api.pqsafe.xyz/v1/audit/<id>` via WebFetch (read-only, no auth needed for audit lookup).
   - If neither → ask the user.

2. **Display the envelope** (don't show the signature value — too noisy). Show:
   - issuer · agent · maxAmount + currency · allowedRecipients (count + first 3) · validFrom (ISO) · validUntil (ISO) · rail.

3. **Verify locally** via the SDK:
   ```bash
   node -e "
   import('@pqsafe/openclaw').then(async ({ createPQSafeOpenClawSkill }) => {
     const skill = createPQSafeOpenClawSkill();
     const result = await skill.invoke('verify_envelope', {
       envelope: <parsed-envelope>
     });
     console.log(JSON.stringify(result, null, 2));
   });
   "
   ```

4. **Check revocation list** by curl-ing the API (no key needed — public lookup):
   ```bash
   curl -sS https://api.pqsafe.xyz/v1/revoke/<envelope-id-or-hash>
   ```
   If `api.pqsafe.xyz` is not yet wired (returns 404 from GitHub Pages), fall back to `https://pqsafe-api-production.raymond-thu87.workers.dev/v1/revoke/<id>`.

5. **Report**. Print exactly one of:
   - ✅ **VALID** — agent `<id>` may spend up to `<amount> <ccy>` to recipients `[<list>]` until `<ISO>`. Not revoked.
   - ❌ **INVALID** — reason: `<SIGNATURE_INVALID | ENVELOPE_EXPIRED | ENVELOPE_NOT_YET_ACTIVE | MALFORMED_ENVELOPE | REVOKED>`. Do NOT honor this envelope.

6. **If invalid** — explain the failure mode in 1 sentence and suggest the next action (re-issue with `/pqsafe-create`, or revoke if compromised, or check system clock if expired).

## Use this verify INSIDE agent code

If the user is integrating into an agent runtime (not a one-off check), point them at the SKILL.md "Path B" — they should wire `verify_envelope` into the `before_tool_call` hook (OpenClaw) or the equivalent payment-tool wrapper for their framework. A one-off `/pqsafe-verify` is for debugging; it's not the production enforcement path.

## Truth-guards
- ML-DSA-65 (3,309-byte sig) — NIST FIPS 204
- Don't claim instant verification on cold cache — first call may pull pubkey from the issuer registry (~50–200ms)
