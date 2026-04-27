# Changelog

All notable changes to PQSafe AgentPay are documented in this file.

Format follows [Conventional Commits](https://www.conventionalcommits.org/) and [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Fixed
- `fbf0b55` — `fix(x402)`: wrap `verifyEnvelope` in try/catch for proper error propagation in `agent-pay/demo/x402-demo.ts`; 402 errors were previously silently swallowed

### Chore
- `2faeb30` — `chore(evm)`: track Sepolia deploy script (`evm/script/DeployV2_1_Sepolia.s.sol`), `VerifyOnEtherscan.sh`, subgraph, Tenderly actions, Forta agent, and e2e/integration test scaffolding

### Refactored
- `bf2933a` — `refactor(cli)`: export `main()` and all handlers from `src/cli/admin.ts` for testability; enables coverage smoke tests for admin CLI

### Tests
- `11385ff` — `test(evm)`: raise `advanceEpoch` gas budgets to match OpenZeppelin AccessControl overhead (Foundry suite now passes all 141 tests)

### Docs
- `a713cf7` — `docs`: generate TypeDoc API reference to `docs/api/` from all public exports in `agent-pay/src/`

### Added
- Coverage smoke tests for `src/cli/admin.ts` and `src/contracts/registry-config.ts` — lifts total line coverage to 81% (above 80% CI threshold)
- Additional x402 error-path tests: `probeX402Endpoint`, real-mode throws, recipient allowlist validation, 200/500 passthrough

### Fixed
- `agent-pay/demo/x402-demo.ts`: wrap `verifyEnvelope` in try/catch for proper error propagation (was silently swallowing 402 errors)
- All `package.json` license fields aligned to `Apache-2.0` (matches root LICENSE file)

### Chore
- EVM deploy artefacts tracked: `evm/script/DeployV2_1_Sepolia.s.sol`, `VerifyOnEtherscan.sh`, subgraph, Tenderly actions, Forta agent, e2e/integration test scaffolding
- ML-DSA-65 signature size corrected: 3293 → 3309 bytes (NIST FIPS 204 final spec)

---

## [0.1.0] — Sprint 1–4 (2026-01 to 2026-04)

### Sprint 4 — Hardening & Multi-Rail Production (2026-04)

#### Added
- Real sandbox/testnet integration for all 5 rails: Wise, Stripe, USDC-Base, x402, Airwallex
- `SpendEnvelopeRegistryV2_1` — Pausable EVM contract extension + V3 migration plan
- Production 3-layer revocation system: per-envelope (Layer 3), epoch bulk-invalidation (Layer 2), TTL-expiry (Layer 1)
- `pqsafe-admin` CLI: `revoke`, `advance-epoch`, `get-epoch`, `status` commands
- `registry-config.ts`: chain ID → deployed contract address mapping (Arbitrum Sepolia, One, Anvil)
- First-class human-confirm approval API (`requestApproval`, `resolveApproval`, `getApprovalStatus`)
- Auto-pause relay via direct `PAUSER_ROLE` call on SpendEnvelopeRegistry

#### Changed
- Test suite migrated from Jest to **Vitest** — 184 unit tests, 141 Foundry contract tests
- Added integration, snapshot, and property-based tests
- EVM: Foundry suite expanded to 141 tests across 5 suites

### Sprint 3 — Integrations & Adapters (2026-03)

#### Added
- End-to-end agent demos: LangChain, CrewAI, MCP, Mastra (`@pqsafe/mastra-pqsafe` plugin)
- Production AP2 and ACP adapter implementations (full type contracts, not stubs)
- Cross-SDK interoperability tests (TypeScript ↔ Python canonical round-trip)
- Python SDK: AP2/ACP adapter parity + Sprint 2 scaffolding
- Python SDK: RFC 8785 JCS canonicalization + structured errors module
- Anonymized ledger auto-submission after successful payments

#### Changed
- Rails: production sandbox implementations for Wise/Stripe/USDC/x402 + multi-rail router
- README: public audit ledger section, TOC links, test badge corrections

### Sprint 2 — Revocation & Policy Scaffolding (2026-02)

#### Added
- Sprint 2 module scaffolds: `spendPolicy`, `revocation`, `issuer`, structured `errors`
- LangChain, CrewAI, MCP, Mastra framework plugins
- AP2 and ACP adapter stubs with full type contracts
- Stripe ACP adapter stub with SPT type contract

### Sprint 1 — Core SDK Foundation (2026-01)

#### Added
- `SpendEnvelope` type + RFC 8785 JCS canonicalization (`canonical.ts`)
- `createEnvelope`, `signEnvelope`, `verifyEnvelope` core functions (ML-DSA-65 post-quantum signatures)
- 5 payment rails: Airwallex, Wise, Stripe, USDC-Base, x402
- RFC 8785 JCS test suite (TC-01–TC-12)
- `files` field in `agent-pay/package.json` for clean npm publish
- REST API documentation: rail catalog with live/sandbox/mock status
- CI: GitHub Actions workflow, LICENSE (Apache-2.0), SECURITY, CONTRIBUTING

#### Fixed
- API: clarified Airwallex-only REST rail limitation
- API: updated rail catalog status — Wise sandbox live, Stripe/USDC/x402 mock-ready

---

## Notes

- **npm publish**: not yet published. Pending `@pqsafe` org registration on npmjs.com.
- **Sepolia deploy**: pending 4 env vars (`ADMIN_ADDRESS`, `TESTNET_KEY`, `ARB_SEPOLIA_RPC`, `ETHERSCAN_API_KEY`).
- **Mainnet deploy**: post-Sherlock audit (Sprint 7, target Aug 2026).
- **AP2 RFC issue**: pending Raymond to file at google-agentic-commerce/AP2 GitHub.
