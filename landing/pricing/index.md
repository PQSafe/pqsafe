---
title: Pricing — PQSafe
description: Post-quantum spending controls for AI agents. Per-agent flat pricing. No transaction fees.
layout: page
---

# Post-quantum spending controls for AI agents. Sign once. Verify everywhere.

Cryptographic enforcement for every agent spend decision — open source core, cloud managed service, enterprise with HSM custody.

[**Start Free**](#free) &nbsp;&nbsp; [**Talk to Sales**](mailto:sales@pqsafe.xyz)

---

## Pricing

<div class="pricing-tiers">

### Free — OSS
**$0 forever**

Self-host the full PQSafe core. No agent limit. No expiry.

- Dilithium3 / ML-DSA-65 signing library
- Policy engine (static YAML rules)
- CLI key management
- Community support (GitHub Issues)
- Audit log: local only, no retention SLA
- No HSM custody
- No managed verification endpoints
- **You run the infrastructure**

[**Get the code on GitHub**](https://github.com/pqsafe/pqsafe)

---

### Cloud
**$299 / agent / month**

Managed verification infrastructure. First 500,000 verifications included. $0.001 per verification thereafter.

- Everything in Free
- Managed signing endpoints (99.9% uptime SLA)
- 500K verifications/agent/month included
- Overage: $0.001 per verification
- Policy-as-code via API or dashboard
- 90-day audit log retention
- SOC 2 Type II report on request (2026 Q3)
- Email + Slack support (next business day)
- Multi-region routing (US, EU, AP)
- **No HSM custody — keys managed in software KMS**

[**Start Free Trial — 14 days, no card required**](#cloud-trial)

---

### Enterprise
**$2,500 – $25,000 / month**
Annual contract. Pricing scales with agent count and verification volume.

- Everything in Cloud
- HSM custody (Thales / AWS CloudHSM)
- Custom verification SLA (up to 99.99%)
- Dedicated Customer Success Manager
- Unlimited audit log retention
- Custom data residency (US / EU / APAC)
- SCIM provisioning + SSO (Okta, Entra)
- Jurisdiction coverage attestation for regulated industries
- SOC 2 Type II + penetration test report
- Custom contract terms (DPA, BAA available)
- SLA credits with financial penalties

[**Talk to Sales**](mailto:sales@pqsafe.xyz)

</div>

---

## Why this pricing model

PQSafe charges per agent per month, not per transaction. The reason is structural: the security guarantee is attached to the agent's identity and key material, not to individual spend events. An agent that makes 1 transaction and an agent that makes 10,000 transactions carry identical cryptographic infrastructure costs — same key ceremony, same policy evaluation engine, same audit trail.

A per-transaction fee would penalize high-frequency agents while subsidizing low-frequency ones. That is the wrong incentive. It would also make PQSafe's cost structure resemble a payment processor, which it is not. PQSafe does not move money. It enforces that agents are who they claim to be and that their spend decisions comply with signed policy at the point of authorization.

The Cloud tier's 500K included verifications covers the vast majority of production deployments. Overage pricing ($0.001) is disclosed up front and billed monthly with no surprise minimums.

There is no SUM (spending under management) fee. Your transaction volume is your business.

---

## Frequently Asked Questions

**Why do I need PQSafe if Stripe is implementing post-quantum TLS natively?**

Stripe's PQ work secures the transport layer — the connection between your server and Stripe's API. PQSafe secures the authorization layer — whether the agent that made the request was the agent it claimed to be, and whether that agent had valid cryptographic authorization for that specific spend decision at that moment. These are different problems. Transport encryption prevents eavesdropping; PQSafe prevents agent impersonation and policy bypass. Both are necessary.

---

**What happens when I hit 500,000 verifications in a month?**

You are not blocked or throttled. Verifications continue at $0.001 each, billed at the end of the month. You will receive an email alert at 80% and 100% of your included quota. There is no hard cap unless you explicitly set a spend ceiling in your account settings.

---

**How does Enterprise differ from Cloud beyond HSM custody?**

The material operational differences are: (1) HSM custody means your signing keys never exist in software — they are generated and used inside hardware security modules, which matters for regulated industries and insurance requirements; (2) custom data residency lets you pin all key material and audit logs to a specific jurisdiction; (3) the SLA includes financial penalties (credits) rather than best-effort; (4) you get a dedicated CSM rather than pooled support. For most software companies, Cloud is sufficient. Enterprise is designed for financial institutions, healthcare, and government contractors where custody chain documentation is required.

---

**Can I self-host the Cloud tier?**

No. The Cloud tier uses PQSafe-operated managed infrastructure. If you want to operate the full stack yourself, use the Free OSS tier. If you need HSM custody in your own infrastructure, contact sales — that is a custom Enterprise arrangement.

---

**Is there a free trial for Cloud?**

Yes. 14 days, no credit card required, full feature access, one agent slot. At the end of the trial you choose to subscribe or your account moves to the Free OSS tier (you retain your keys and audit logs as an export).

---

**What is included in audit log retention?**

Every verification event includes: timestamp (UTC), agent ID, policy version hash, verification outcome (pass/fail), spend amount and currency (if provided by the caller), and the request IP. Cloud retains 90 days rolling. Enterprise retains indefinitely with configurable archival to your own S3-compatible bucket. Audit logs cannot be deleted by account holders — only exported.

---

**Do you offer a YC discount?**

Yes. Active YC companies (any batch) receive 20% off Cloud for 12 months. Email your YC confirmation to sales@pqsafe.xyz with subject line "YC discount request."

---

**What is the data residency model?**

Cloud tier: data processed and stored in the region closest to the request origin (US, EU, or AP). No cross-region replication. No guarantee of a specific country. If you need country-level pinning (e.g., data must remain in Germany for GDPR purposes), that requires the Enterprise tier with custom data residency.

---

**Can I upgrade or downgrade mid-month?**

Upgrades (Free to Cloud, Cloud to Enterprise) take effect immediately. Downgrades take effect at the next billing cycle. Prorated credits are applied for upgrades mid-cycle. There is no penalty for downgrading.

---

**What does the SLA actually mean operationally?**

Cloud 99.9% uptime means no more than ~43 minutes of downtime per month on the verification endpoint. Planned maintenance is excluded and announced 48 hours in advance. There are no financial credits on the Cloud tier for downtime — it is a best-efforts commitment. Enterprise SLAs (up to 99.99%, ~4 minutes/month) include financial credits (typically 10x the prorated monthly fee for the affected period) and a defined incident response time (15 minutes for P1 on Enterprise).

---

## Comparison

| Feature | PQSafe | Skyfire | Crossmint | Stripe Issuing | AWS AgentCore | Self-host (OSS) |
|---|---|---|---|---|---|---|
| Post-quantum signing | Yes (ML-DSA-65) | No | No | No | No | Yes (PQSafe OSS) |
| Cryptographic spend enforcement | Yes | Partial (API keys) | No | No | No | Yes |
| Audit log retention | 90d Cloud / unlimited Enterprise | 30d | 30d | 13 months (Stripe data) | 90d (CloudTrail) | You manage |
| Jurisdiction coverage attestation | Enterprise only | No | No | No | Regional | No |
| Open source core | Yes (MIT) | No | No | No | No | Yes |
| Per-transaction fees | No | Yes | Yes | Yes (interchange) | Yes (API calls) | No |
| HSM custody | Enterprise only | No | No | No | Yes (CloudHSM) | No (unless you add it) |
| Managed infra | Cloud + Enterprise | Yes | Yes | Yes | Yes | No |

Notes: Skyfire and Crossmint are agent payment rails, not cryptographic authorization layers — different product category. Stripe Issuing does not verify agent identity. AWS AgentCore provides IAM-based agent authorization without PQ signing. Comparison reflects publicly available information as of May 2026.

---

## Start building

[**Start Free — no card required**](#cloud-trial) &nbsp;&nbsp; [**View docs**](/quickstart) &nbsp;&nbsp; [**GitHub**](https://github.com/pqsafe/pqsafe)

**Stay informed.** Product updates, benchmark reports, and RFC announcements:

<form action="/subscribe" method="POST" style="display:inline-flex;gap:8px;margin-top:8px;">
  <input type="email" name="email" placeholder="you@company.com" required style="padding:8px 12px;border:1px solid #ccc;border-radius:4px;font-size:14px;width:240px;">
  <button type="submit" style="padding:8px 16px;background:#1a1a1a;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer;">Subscribe</button>
</form>

No spam. Unsubscribe any time.
