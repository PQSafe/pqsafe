# Contributing to PQSafe

Thanks for your interest in PQSafe AgentPay.

## Development setup

```bash
cd agent-pay
npm install
npm test
npm run typecheck
```

## How to contribute

1. Fork the repo
2. Create a feature branch from `main`
3. Make your changes with tests
4. Run `npm test && npm run typecheck` — must pass
5. Open a PR with a clear description

## Code style

- TypeScript strict mode
- Existing test pattern (no mocha/vitest — pure async test functions)
- RFC 8785 JCS for any signed JSON
- ML-DSA-65 via @noble/post-quantum for signatures

## What we're looking for

- Rail integrations (new payment rails as adapters in src/rails/)
- Framework plugins (LangChain, CrewAI, Mastra, MCP)
- Test cases that catch real edge cases
- Documentation improvements

## What we're not ready for yet

- Production cryptographic changes (in active development by founders)
- Breaking API changes (pre-1.0 stability not yet promised)

## Questions?

Open a Discussion or email hello@pqsafe.xyz.
