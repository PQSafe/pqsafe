---
description: Create a PQSafe SpendEnvelope — bounded mandate authorizing an agent to spend up to a max amount on an allowlist of recipients
argument-hint: [agent-id] [max-amount] [currency] [recipient1,recipient2,...]
allowed-tools: Bash, Read, Write
---

# /pqsafe-create — Issue a SpendEnvelope

You are creating a post-quantum signed payment mandate for an AI agent. The user has invoked `/pqsafe-create` with arguments: `$ARGUMENTS`.

## Steps

1. **Parse arguments**. Expected: `<agent-id> <max-amount> <currency> <recipient-csv>`. If incomplete, ask the user the missing fields, but ONLY ask for what's actually missing — don't re-prompt for fields they provided.

2. **Verify environment**:
   - Run `node -e "console.log(process.env.PQSAFE_TEST_MODE, process.env.PQSAFE_API_KEY ? 'KEY-SET' : 'NO-KEY')"` (no secrets revealed)
   - If neither `PQSAFE_TEST_MODE=true` nor `PQSAFE_API_KEY` is set: warn the user, then default to test mode for the demo.

3. **Confirm before creating**. Show the user a summary:
   ```
   Issuing SpendEnvelope:
     agent:      <id>
     maxAmount:  <amount> <currency>
     recipients: <count> entries
     ttl:        3600s (1h)
     rail:       any
     mode:       PQSAFE_TEST_MODE | production
   Proceed? (y/n)
   ```
   Wait for explicit confirmation.

4. **Create**. Execute via the `@pqsafe/openclaw` package OR `@pqsafe/agent-pay` if installed:
   ```bash
   PQSAFE_TEST_MODE=${PQSAFE_TEST_MODE:-true} node -e "
   import('@pqsafe/openclaw').then(async ({ createPQSafeOpenClawSkill }) => {
     const skill = createPQSafeOpenClawSkill();
     const env = await skill.invoke('create_envelope', {
       issuer: 'pq1' + 'a'.repeat(40),
       agent: '<agent-id>',
       maxAmount: <amount>,
       currency: '<CCY>',
       allowedRecipients: [<csv-quoted>],
       ttlSeconds: 3600
     });
     console.log(JSON.stringify(env, null, 2));
   });
   "
   ```
   If `@pqsafe/openclaw` isn't installed, run `npm install @pqsafe/openclaw` first (cwd = nearest `package.json`).

5. **Save** the resulting envelope to a local file the user can reuse: `./pqsafe-envelope-<agent-id>-<timestamp>.json`. Tell them where it is.

6. **Next step** — print this:
   ```
   Verify any time:    /pqsafe-verify ./pqsafe-envelope-<agent-id>-<ts>.json
   Revoke if needed:   /pqsafe-revoke ./pqsafe-envelope-<agent-id>-<ts>.json
   Wire into agent:    see SKILL.md "Path B — Code generation"
   ```

## Truth-guards
- ML-DSA-65 sig = 3,309 bytes
- Apache-2.0 license
- Don't claim "global first" — first-batch (首批) is honest
- Use `clawhub.ai`, never `.dev`

## Errors
- If the user is in production mode and `PQSAFE_API_KEY` is missing → STOP, tell them to get a key from dashboard.pqsafe.xyz, do NOT attempt to substitute test mode silently
- If the recipient list is empty → STOP, an empty allowlist blocks all payments and is almost certainly a mistake
- If `maxAmount` is greater than 1,000,000 in any currency → confirm twice before proceeding
