---
description: Revoke a PQSafe SpendEnvelope — appends to real-time revocation list and writes audit-log entry; non-reversible
argument-hint: <path-to-envelope.json | envelope-id> [reason]
allowed-tools: Bash, Read
---

# /pqsafe-revoke — Revoke a SpendEnvelope

You are revoking an issued mandate. **This action is irreversible** — the revocation list is append-only and cryptographically chained. The user invoked `/pqsafe-revoke` with: `$ARGUMENTS`.

## Steps

1. **Resolve the envelope** (same as `/pqsafe-verify` step 1).

2. **Display what will be revoked**. Show:
   - issuer · agent · maxAmount + currency · validUntil · time-since-issued.

3. **Confirm twice** because this is irreversible:
   ```
   ⚠ Revoking this envelope is PERMANENT.
   - The agent will lose authorization immediately
   - The revocation entry is hash-chained into the audit ledger
   - You cannot un-revoke — only issue a new envelope

   Reason for revocation (free text, will be stored in audit log):
   ```
   Wait for the user to type a reason. If they don't provide one, ask once more — never auto-fill a reason.

4. **Execute** via the SDK:
   ```bash
   PQSAFE_API_KEY=${PQSAFE_API_KEY} node -e "
   import('@pqsafe/openclaw').then(async ({ createPQSafeOpenClawSkill }) => {
     const skill = createPQSafeOpenClawSkill();
     const result = await skill.invoke('revoke_envelope', {
       envelope: <parsed-envelope>,
       reason: '<user-reason>'
     });
     console.log(JSON.stringify(result, null, 2));
   });
   "
   ```

5. **Verify the revocation took effect**:
   ```bash
   curl -sS https://api.pqsafe.xyz/v1/revoke/<envelope-id>
   ```
   Expect: `{ "revoked": true, "revoked_at": "..." }`.

6. **Audit-log entry** — print the hash of the audit entry so the user can later verify it on `ledger.pqsafe.xyz`. Save the audit-log ID + timestamp to `./pqsafe-revocation-<envelope-id>.json` for their records.

## Constraints
- DO NOT revoke without an explicit `PQSAFE_API_KEY` set — even in test mode, revocation is meaningful and should not be auto-fired
- DO NOT batch-revoke more than 1 envelope per `/pqsafe-revoke` invocation — if user wants multiple, run the command multiple times so each gets its own confirmation
- If `api.pqsafe.xyz` is unreachable → fall back to the Worker direct URL `https://pqsafe-api-production.raymond-thu87.workers.dev`

## Common revocation reasons (suggest if user is stuck)
- `agent_compromised` — agent's runtime was breached
- `recipient_disputed` — discovered an allowed recipient was malicious
- `policy_change` — issuer policy update made the cap insufficient or excessive
- `superseded_by_<new-envelope-id>` — replacement envelope issued
- `scheduled_rotation` — periodic key/mandate rotation
