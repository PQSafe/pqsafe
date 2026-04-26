# Security Policy

## Reporting a Vulnerability

PQSafe takes security seriously. If you discover a vulnerability, please report it privately.

**Email:** security@pqsafe.xyz

Please include:
- Description of the issue
- Steps to reproduce
- Affected version/commit
- Your assessment of impact

## Disclosure Timeline

- We aim to acknowledge reports within 72 hours
- We aim to issue a fix within 90 days for critical issues
- Coordinated disclosure: we will work with you on public disclosure timing
- We do not currently operate a paid bug bounty program

## Scope

In scope:
- Cryptographic implementation flaws (signature, canonicalization, replay)
- Authentication/authorization bypass
- Smart contract vulnerabilities (Arbitrum SpendEnvelopeRegistry)
- Dependency vulnerabilities

Out of scope:
- Issues in third-party services we depend on (report to that service)
- Social engineering
- Physical attacks

## Pre-Production Notice

PQSafe is in active development. The codebase has known limitations documented in our roadmap. Please do not use for production funds without reviewing the security model and limitations.
