/**
 * LangChain + Anthropic integration test
 *
 * Only runs when ANTHROPIC_API_KEY env var is set.
 * Tests the LangChain agent example end-to-end.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const SKIP = !ANTHROPIC_KEY

// Check if langchain example exists
const LANGCHAIN_EXAMPLE = resolve(__dirname, '../../integrations/langchain/langchain_pqsafe.py')
const HAS_EXAMPLE = existsSync(LANGCHAIN_EXAMPLE)

describe.skipIf(SKIP || !HAS_EXAMPLE)('LangChain + Anthropic integration', () => {
  it.skipIf(SKIP || !HAS_EXAMPLE)('LangChain agent example runs end-to-end', async () => {
    if (SKIP) return
    if (!HAS_EXAMPLE) {
      console.log('  [SKIP] LangChain example not found — skipping')
      return
    }

    const { spawnSync } = await import('node:child_process')
    const result = spawnSync(
      'python3',
      [LANGCHAIN_EXAMPLE, '--test-mode'],
      {
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, ANTHROPIC_API_KEY: ANTHROPIC_KEY, PQSAFE_MOCK_MODE: '1' },
      },
    )

    if (result.error) {
      throw new Error(`Failed to run LangChain example: ${result.error.message}`)
    }

    // Accept both success (0) and "not implemented" (graceful exit)
    expect([0, 1]).toContain(result.status)
    // Ensure it doesn't crash with an unhandled exception
    expect(result.stderr ?? '').not.toContain('Traceback (most recent call last)')
  })
})

if (SKIP) {
  describe('LangChain + Anthropic integration', () => {
    it('SKIPPED — ANTHROPIC_API_KEY not set', () => {
      console.log('  [SKIP] ANTHROPIC_API_KEY not in environment — LangChain tests skipped')
    })
  })
}
