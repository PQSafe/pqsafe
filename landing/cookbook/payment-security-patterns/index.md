# Payment Security Patterns — PQSafe Cookbook

> Originally submitted for OpenClaw Cookbook merge on 2026-05-05 (fork: github.com/rayc0/docs, branch: cookbook/payment-security-patterns, commit 6897f17). PR submission blocked by upstream GitHub settings. Full content published here to make it verifiable and searchable while awaiting maintainer review.

**URL:** https://pqsafe.xyz/cookbook/payment-security-patterns  
**Tags:** payments, post-quantum, ML-DSA-65, langchain, crewai, openclaw, FIDO AP2-PQ  
**License:** Apache-2.0 (SDK) / MIT (docs)

---

## Why This Matters

The ClawHavoc supply-chain attack of April 2026 exposed 138 CVEs across 1,400+ malicious skills on clawhub.ai. Several silently redirected payment tool calls to attacker-controlled accounts. The FIDO Alliance's AP2-PQ profile (published 28 April 2026) establishes the standard pattern for post-quantum mandate verification in autonomous agents. This cookbook implements it.

---

## The Threat Model

| Attack Vector | How SpendEnvelope Stops It |
|---|---|
| Hallucinated recipient | Recipient ID is signed into envelope — mismatch at verification = block |
| Prompt-injected amount | Amount ceiling is signed — exceeding it = block |
| Replayed mandate | Nonce is single-use — server-side replay log rejects second use |
| Compromised package | Envelope covers all fields via canonical serialization — any tamper = invalid signature |
| Stale allowlist | Envelope carries expiry (≤5 min recommended) — clock check = block |

---

## Recipe 1: LangChain Agent (Python)

```python
import os, uuid
from datetime import datetime, timedelta, timezone
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.tools import Tool
from langchain_openai import ChatOpenAI
from langchain_pqsafe import PQSafeAuthorizer, SpendEnvelope

authorizer = PQSafeAuthorizer(api_key=os.environ["PQSAFE_API_KEY"])

def authorize_and_pay(charge_request: str) -> str:
    amount_cents = 2999
    merchant_id  = "stripe:acct_xxx"

    envelope = SpendEnvelope(
        agent_id="lc-agent-prod-01",
        amount_usd_cents=amount_cents,
        merchant_id=merchant_id,
        expires_at=(datetime.now(timezone.utc) + timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        nonce=str(uuid.uuid4()),
    )

    signed = authorizer.sign(envelope)              # ML-DSA-65, 3,309-byte sig
    result = authorizer.verify(signed, endpoint="https://pqsafe.xyz/verify")
    if not result.ok:
        return f"Payment blocked by PQSafe: {result.reason}"

    # stripe.PaymentIntent.create(amount=amount_cents, currency="usd", ...)
    return f"Payment of ${amount_cents/100:.2f} authorized. Nonce: {signed.nonce}"

payment_tool = Tool(
    name="authorized_payment",
    func=authorize_and_pay,
    description="Charge a customer. Post-quantum authorization required.",
)

executor = AgentExecutor(
    agent=create_openai_tools_agent(ChatOpenAI(model="gpt-4o", temperature=0), [payment_tool], prompt=...),
    tools=[payment_tool]
)
executor.invoke({"input": "Charge the customer $29.99 for the Pro plan."})
```

---

## Recipe 2: CrewAI Multi-Agent Shared Envelope

```python
from crewai import Agent, Crew, Task
from pqsafe import PQSafeAuthorizer, SpendEnvelope

authorizer = PQSafeAuthorizer(api_key=os.environ["PQSAFE_API_KEY"])

def create_shared_envelope(amount_cents: int, merchant_id: str) -> dict:
    envelope = SpendEnvelope(
        agent_id="crewai-billing-crew-v1",
        amount_usd_cents=amount_cents,
        merchant_id=merchant_id,
        expires_at=(datetime.now(timezone.utc) + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        nonce=str(uuid.uuid4()),
    )
    return authorizer.sign(envelope).to_dict()

shared_envelope = create_shared_envelope(amount_cents=4999, merchant_id="stripe:acct_live")

billing_agent = Agent(
    role="Billing Specialist",
    goal="Execute authorized payments only — never move money without a verified envelope.",
    allow_delegation=False,
)
Crew(agents=[billing_agent], tasks=[Task(
    description=f"Verify and execute this envelope: {shared_envelope}",
    agent=billing_agent,
    expected_output="Payment executed confirmation with nonce.",
)]).kickoff()
```

---

## Recipe 3: OpenClaw Skill with pqsafe-pay

```typescript
// clawhub install pqsafe-pay  OR  npm install @pqsafe/openclaw
import { OpenClawAgent } from "@openclaw/sdk";
import { pqsafePay, SpendEnvelope } from "@pqsafe/openclaw";
import { randomUUID } from "crypto";

const agent = new OpenClawAgent({
  skills: [pqsafePay({ apiKey: process.env.PQSAFE_API_KEY!, verifyEndpoint: "https://pqsafe.xyz/verify" })],
});

agent.on("authorizePayment", async (ctx) => {
  const envelope = new SpendEnvelope({
    agentId: ctx.agentId,
    amountUsdCents: ctx.params.amountCents,
    merchantId: ctx.params.merchantId,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    nonce: randomUUID(),
  });
  const signed = await ctx.skills.pqsafePay.sign(envelope);
  const result = await ctx.skills.pqsafePay.verify(signed);
  if (!result.ok) { ctx.reject(`PQSafe blocked: ${result.reason}`); return; }
  ctx.resolve({ authorized: true, nonce: signed.nonce });
});
```

---

## Verification Failure Codes

| Reason | What Triggered It |
|---|---|
| `SIGNATURE_INVALID` | Envelope fields tampered after signing, or wrong key |
| `ENVELOPE_EXPIRED` | expires_at passed — prevents delayed replay attacks |
| `NONCE_REPLAYED` | Nonce already consumed — prevents double-spend |
| `MERCHANT_MISMATCH` | merchant_id doesn't match the signed envelope |
| `AMOUNT_EXCEEDED` | Requested charge exceeds signed ceiling |

---

## Security Model

- **Algorithm**: ML-DSA-65 (NIST FIPS 204, CRYSTALS-Dilithium3 level 3)
- **Signature size**: 3,309 bytes over every SpendEnvelope field
- **Verifier**: Cloudflare Worker at pqsafe.xyz/verify — stateless, globally distributed
- **Replay protection**: Server-side nonce log, TTL = expires_at + 10 minutes
- **RFC draft**: draft-chau-ap2-pq-spend-envelope-00
- **Standards**: FIDO Alliance Agentic Authentication TWG (AP2-PQ, Apr 28 2026)

---

## Resources

- npm: [@pqsafe/openclaw](https://www.npmjs.com/package/@pqsafe/openclaw)
- PyPI: [langchain-pqsafe](https://pypi.org/project/langchain-pqsafe/)
- ClawHub: [clawhub.ai/skills/pqsafe-pay](https://clawhub.ai/skills/pqsafe-pay)
- Spec: [pqsafe.xyz/spec](https://pqsafe.xyz/spec)
- FIDO TWG: [fidoalliance.org/...](https://fidoalliance.org/fido-alliance-agentic-authentication-technical-working-group/)
- Fork: [github.com/rayc0/docs@cookbook/payment-security-patterns](https://github.com/rayc0/docs/tree/cookbook/payment-security-patterns)
