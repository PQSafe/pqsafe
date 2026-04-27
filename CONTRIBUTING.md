# Contributing to PQSafe AgentPay

Thank you for your interest in PQSafe. This document covers everything you need
to contribute effectively.

---

## Table of contents

1. [Development setup](#development-setup)
2. [Commit conventions](#commit-conventions)
3. [Testing](#testing)
4. [Lint and type-check](#lint-and-type-check)
5. [Pull request process](#pull-request-process)
6. [Code of conduct](#code-of-conduct)
7. [Security disclosure](#security-disclosure)

---

## Development setup

**Prerequisites:** Node.js ≥ 20, npm ≥ 10.

```bash
git clone https://github.com/PQSafe/pqsafe.git
cd pqsafe/agent-pay
npm install
npm test          # 221 ts + 141 forge tests must pass
npm run typecheck # strict TypeScript — must pass
```

**Forge (EVM) tests** (requires Foundry):

```bash
cd ../evm
forge test
```

**Run a specific example:**

```bash
cd agent-pay
npm run demo:basic
```

---

## Commit conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | When to use |
|---|---|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `test:` | Adding or fixing tests |
| `refactor:` | Code change that neither fixes a bug nor adds a feature |
| `chore:` | Tooling, deps, CI |
| `perf:` | Performance improvement |
| `security:` | Security hardening (non-breaking) |

Example: `feat(rails): add Wise sandbox adapter`

Keep the subject line ≤ 72 characters. Add a body if the change is non-trivial.

---

## Testing

- All code must ship with tests. No exceptions.
- Test framework: **vitest** (`npm test`)
- Coverage gate: **≥ 80% line coverage** (`npm run test:coverage`)
- Forge tests for any EVM contract changes (`forge test`)
- Canonical JSON edge cases belong in `test/canonical.test.ts`
- For new rails: add an integration test under `src/rails/<rail>/` using a
  mocked `fetch`

```bash
# Full test suite
npm test

# Coverage report
npm run test:coverage

# Watch mode (during development)
npm run test:watch
```

---

## Lint and type-check

```bash
npm run typecheck   # tsc --noEmit (strict mode)
```

There is no separate ESLint config yet — `tsc --noEmit` is the style gate.
TypeScript strict mode is non-negotiable.

**Key conventions:**
- RFC 8785 JCS (`canonicalize` lib) for any signed JSON — never `JSON.stringify`
- ML-DSA-65 via `@noble/post-quantum` for all signatures
- No `any` types
- Prefer `unknown` + runtime validation (Zod) over `any` for external data

---

## Pull request process

1. Fork the repo and create a feature branch from `main`:
   `git checkout -b feat/your-feature`
2. Make your changes with tests.
3. Run `npm test && npm run typecheck` — must pass cleanly.
4. Open a PR against `main` with a clear description using the PR template.
5. A maintainer will review within 5 business days.
6. Squash-merge is used — keep your PR focused (one concern per PR).

**Branch naming:**
- `feat/<short-name>`
- `fix/<short-name>`
- `docs/<short-name>`
- `security/<short-name>` (ping @raymondchau in the PR body)

---

## What we are looking for

- Rail integrations (new payment rails as adapters in `src/rails/`)
- Framework plugins (LangChain, CrewAI, Mastra, MCP)
- Test cases that catch real edge cases (property-based tests with fast-check
  are especially welcome)
- Documentation improvements and example apps

## What we are not ready for yet

- Production cryptographic changes (in active development by founders)
- Breaking API changes (pre-1.0 stability not yet promised)
- Changes to `src/canonical.ts` without a corresponding RFC citation

---

## Code of conduct

This project adheres to the
[Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
Be kind, be constructive.

---

## Security disclosure

**Do not open a public GitHub issue for security vulnerabilities.**

See [SECURITY.md](./SECURITY.md) for the responsible disclosure process and
contact details. We aim to acknowledge reports within 48 hours.

---

## Questions?

Open a [Discussion](https://github.com/PQSafe/pqsafe/discussions) or email
hello@pqsafe.xyz.
