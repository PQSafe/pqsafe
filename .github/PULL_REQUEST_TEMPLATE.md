## Summary

<!-- One paragraph: what does this PR do and why? -->

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change (discuss in body below)
- [ ] Documentation / tooling
- [ ] Security hardening

## Changes

<!-- Bullet list of specific changes -->

-
-

## Testing

- [ ] `npm test` passes (221 ts + 141 forge tests)
- [ ] `npm run typecheck` passes
- [ ] Coverage remains ≥ 80% (`npm run test:coverage`)
- [ ] New behaviour is covered by tests

## Security checklist (if touching crypto or envelope logic)

- [ ] No `JSON.stringify` on signed data — only `canonicalize` (RFC 8785)
- [ ] No new dependencies added without explicit review
- [ ] No secrets or keys committed
- [ ] ML-DSA-65 key sizes validated (public: 1952 bytes, secret: 4032 bytes)

## Related issues

Closes #

## Notes for reviewer

<!-- Anything the reviewer should pay special attention to -->
