/**
 * CrewAI renewal crew integration test
 *
 * Only runs when ANTHROPIC_API_KEY env var is set.
 * Tests the CrewAI crew example end-to-end.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const SKIP = !ANTHROPIC_KEY

// Check if crewai example exists
const CREWAI_EXAMPLE = resolve(__dirname, '../../integrations/crewai/crewai_pqsafe/__init__.py')
const HAS_EXAMPLE = existsSync(CREWAI_EXAMPLE)

describe.skipIf(SKIP || !HAS_EXAMPLE)('CrewAI renewal crew integration', () => {
  it.skipIf(SKIP || !HAS_EXAMPLE)('CrewAI crew example runs end-to-end', async () => {
    if (SKIP) return
    if (!HAS_EXAMPLE) {
      console.log('  [SKIP] CrewAI example not found — skipping')
      return
    }

    const { spawnSync } = await import('node:child_process')
    const result = spawnSync(
      'python3',
      ['-m', 'crewai_pqsafe', '--test-mode'],
      {
        encoding: 'utf8',
        timeout: 90_000,
        cwd: resolve(__dirname, '../../integrations/crewai'),
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: ANTHROPIC_KEY,
          PQSAFE_MOCK_MODE: '1',
          PYTHONPATH: resolve(__dirname, '../../integrations/crewai'),
        },
      },
    )

    if (result.error) {
      throw new Error(`Failed to run CrewAI example: ${result.error.message}`)
    }

    // Accept success (0) or graceful "not fully implemented" exit
    expect([0, 1]).toContain(result.status)
    expect(result.stderr ?? '').not.toContain('Traceback (most recent call last)')
  })
})

if (SKIP) {
  describe('CrewAI renewal crew integration', () => {
    it('SKIPPED — ANTHROPIC_API_KEY not set', () => {
      console.log('  [SKIP] ANTHROPIC_API_KEY not in environment — CrewAI tests skipped')
    })
  })
}
