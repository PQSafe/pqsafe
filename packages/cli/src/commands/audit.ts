/**
 * audit — look up an audit log entry by ID
 *
 * Usage: pqsafe audit <audit-id>
 */

import { apiAudit } from '../lib/api.js'

export interface AuditOptions {
  auditId: string
}

export async function commandAudit(opts: AuditOptions): Promise<void> {
  console.log(`Fetching audit log entry: ${opts.auditId}`)
  console.log('')

  let result: Awaited<ReturnType<typeof apiAudit>>
  try {
    result = await apiAudit(opts.auditId)
  } catch (err) {
    console.error(`Audit lookup failed: ${(err as Error).message}`)
    process.exit(1)
  }

  console.log(`Audit entry:`)
  console.log(`  ID:         ${result.id}`)
  console.log(`  Event:      ${result.event_type}`)
  console.log(`  Timestamp:  ${result.timestamp}`)
  if (result.details && Object.keys(result.details).length > 0) {
    console.log(`  Details:`)
    for (const [k, v] of Object.entries(result.details)) {
      console.log(`    ${k}: ${JSON.stringify(v)}`)
    }
  }
}
