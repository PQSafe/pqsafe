import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Use node environment (no DOM)
    environment: 'node',

    // Include all unit test files (exclude integration/)
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**'],

    // Globals: use explicit imports (describe/it/expect from vitest)
    globals: false,

    // Timeout per test (ML-DSA keygen is slow)
    testTimeout: 30_000,

    // Thread pool — run serially to avoid module-level side effects
    // (some tests mutate process.env + module caches)
    pool: 'forks',
    singleFork: true,

    // Coverage config
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Exclude stubs and network clients with external dependencies not testable in unit tests:
      //   - arbitrum.ts: on-chain registry (requires EVM node)
      //   - ledger.ts: network telemetry sink (fire-and-forget, hard to test without server)
      //   - approval.ts: Telegram approval gate (requires live Telegram bot)
      //   - airwallex.ts: full Airwallex REST client (tested via integration tests)
      //   - sprint2 stubs: policy/revocation/issuer are NOT_IMPL scaffolding
      exclude: [
        'src/**/*.d.ts',
        'dist/**',
        'src/arbitrum.ts',
        'src/ledger.ts',
        'src/approval.ts',
        'src/rails/airwallex.ts',
        'src/sprint2/issuer.ts',
        'src/sprint2/policy.ts',
        'src/sprint2/revocation.ts',
      ],
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 60, // branch coverage is limited by untestable error paths in rail clients
      },
    },

    // Snapshot directory
    resolveSnapshotPath: (testPath, snapExtension) =>
      testPath.replace('tests/', 'tests/__snapshots__/') + snapExtension,
  },

  // Module resolution — map .js imports to .ts source (NodeNext style)
  resolve: {
    // Vitest handles .ts natively; the .js extension in imports is fine
    conditions: ['import', 'default'],
  },
})
