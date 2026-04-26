import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.integration.test.ts'],
    globals: false,
    testTimeout: 300_000, // 5 min — sandbox APIs can be slow
    pool: 'forks',
    singleFork: true, // Integration tests share env state
    reporter: ['verbose'],
  },
  resolve: {
    conditions: ['import', 'default'],
  },
})
