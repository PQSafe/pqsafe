/**
 * PQSafe SpendEnvelopeRegistryV2_1 — Forta Monitoring Agent
 *
 * Circuit-breaker rules (per memory/working/pqsafe_onchain_monitoring_2026-04-26.md):
 *   Rule 1: >1000 EnvelopeCommitted events/hr from one issuer  → Critical
 *   Rule 2: >100  EnvelopeRevoked events/hr from one issuer    → Critical
 *   Rule 3: >5    IssuerEpochAdvanced events in 24h            → Critical
 *
 * High-severity pre-warnings fire at 75% of each threshold.
 */

import {
  BlockEvent,
  Finding,
  FindingSeverity,
  FindingType,
  HandleBlock,
  HandleTransaction,
  TransactionEvent,
  getEthersProvider,
} from "@forta/agent";
import { BigNumber, ethers } from "ethers";

// ---------------------------------------------------------------------------
// Contract configuration
// ---------------------------------------------------------------------------

/** Production: Arbitrum One (42161). Set via forta.config.json. */
export const CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS?.toLowerCase() ??
  "0x0000000000000000000000000000000000000000"; // placeholder until mainnet deploy

// Event topic hashes (keccak256 of signature)
const ENVELOPE_COMMITTED_TOPIC = ethers.utils.id(
  "EnvelopeCommitted(address,address,bytes32,bytes32,uint128,bytes3,uint64,bytes16,uint64,uint256)"
);
const ENVELOPE_REVOKED_TOPIC = ethers.utils.id(
  "EnvelopeRevoked(bytes32,address,bytes32)"
);
const ISSUER_EPOCH_ADVANCED_TOPIC = ethers.utils.id(
  "IssuerEpochAdvanced(address,uint64,uint64)"
);

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const COMMIT_THRESHOLD_CRITICAL = 1000; // >1000/hr
export const COMMIT_THRESHOLD_HIGH = 750; // >750/hr (75% warning)
export const REVOKE_THRESHOLD_CRITICAL = 100; // >100/hr
export const REVOKE_THRESHOLD_HIGH = 75; // >75/hr
export const EPOCH_THRESHOLD_CRITICAL = 5; // >5 in 24h
export const EPOCH_THRESHOLD_HIGH = 4; // >4 in 24h (75% warning)

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

// ---------------------------------------------------------------------------
// Rolling-window state
// ---------------------------------------------------------------------------

/** A timestamped event entry. txHash is stored for metadata. */
interface TimestampedEvent {
  timestamp: number; // Unix ms
  txHash: string;
}

/**
 * Per-issuer rolling window of commit events (last 60 min).
 * key: lowercase issuer address
 */
const commitWindow: Map<string, TimestampedEvent[]> = new Map();

/**
 * Per-issuer/revoker rolling window of revocation events (last 60 min).
 * key: lowercase revokedBy address
 */
const revokeWindow: Map<string, TimestampedEvent[]> = new Map();

/**
 * Global epoch advance window (last 24h).
 * key: lowercase issuer address
 */
const epochWindow: Map<string, TimestampedEvent[]> = new Map();

// ---------------------------------------------------------------------------
// Alert dedup: track last finding time per rule to avoid alert storms
// ---------------------------------------------------------------------------
const lastAlertTime: Map<string, number> = new Map();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 min cooldown between same-rule alerts

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Prune events older than windowMs from the array in-place. */
function pruneWindow(events: TimestampedEvent[], windowMs: number, nowMs: number): TimestampedEvent[] {
  return events.filter((e) => nowMs - e.timestamp <= windowMs);
}

/** Append event and return pruned list. */
function recordEvent(
  windowMap: Map<string, TimestampedEvent[]>,
  key: string,
  entry: TimestampedEvent,
  windowMs: number
): TimestampedEvent[] {
  const existing = windowMap.get(key) ?? [];
  existing.push(entry);
  const pruned = pruneWindow(existing, windowMs, entry.timestamp);
  windowMap.set(key, pruned);
  return pruned;
}

/** Deduplicate txHashes for metadata (last 10 are enough). */
function latestTxHashes(events: TimestampedEvent[]): string[] {
  return [...new Set(events.map((e) => e.txHash))].slice(-10);
}

/** Check alert cooldown. Returns true if we should fire an alert. */
function shouldAlert(key: string, nowMs: number): boolean {
  const last = lastAlertTime.get(key);
  if (last === undefined || nowMs - last > ALERT_COOLDOWN_MS) {
    lastAlertTime.set(key, nowMs);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Finding builders
// ---------------------------------------------------------------------------

function commitRateAlert(
  issuer: string,
  count: number,
  txHashes: string[],
  severity: FindingSeverity,
  label: string
): Finding {
  return Finding.fromObject({
    name: "PQSafe: Commit Rate Spike",
    description: `Issuer ${issuer} committed ${count} envelopes in the last 60 minutes (threshold: ${COMMIT_THRESHOLD_CRITICAL})`,
    alertId: `PQSAFE-COMMIT-RATE-${label}`,
    severity,
    type: FindingType.SuspiciousActivity,
    protocol: "PQSafe AgentPay",
    metadata: {
      issuer,
      count: count.toString(),
      timeframe: "60min",
      threshold: COMMIT_THRESHOLD_CRITICAL.toString(),
      txHashes: JSON.stringify(txHashes),
      rule: "Rule1_CommitRate",
    },
    addresses: [issuer, CONTRACT_ADDRESS],
  });
}

function revokeRateAlert(
  revokedBy: string,
  count: number,
  txHashes: string[],
  severity: FindingSeverity,
  label: string
): Finding {
  return Finding.fromObject({
    name: "PQSafe: Mass Revocation Spike",
    description: `Address ${revokedBy} revoked ${count} envelopes in the last 60 minutes (threshold: ${REVOKE_THRESHOLD_CRITICAL})`,
    alertId: `PQSAFE-REVOKE-RATE-${label}`,
    severity,
    type: FindingType.SuspiciousActivity,
    protocol: "PQSafe AgentPay",
    metadata: {
      revokedBy,
      count: count.toString(),
      timeframe: "60min",
      threshold: REVOKE_THRESHOLD_CRITICAL.toString(),
      txHashes: JSON.stringify(txHashes),
      rule: "Rule2_RevokeRate",
    },
    addresses: [revokedBy, CONTRACT_ADDRESS],
  });
}

function epochRateAlert(
  issuer: string,
  count: number,
  txHashes: string[],
  severity: FindingSeverity,
  label: string
): Finding {
  return Finding.fromObject({
    name: "PQSafe: Rapid Epoch Advance",
    description: `Issuer ${issuer} advanced epoch ${count} times in the last 24 hours (threshold: ${EPOCH_THRESHOLD_CRITICAL})`,
    alertId: `PQSAFE-EPOCH-RATE-${label}`,
    severity,
    type: FindingType.SuspiciousActivity,
    protocol: "PQSafe AgentPay",
    metadata: {
      issuer,
      count: count.toString(),
      timeframe: "24h",
      threshold: EPOCH_THRESHOLD_CRITICAL.toString(),
      txHashes: JSON.stringify(txHashes),
      rule: "Rule3_EpochRate",
    },
    addresses: [issuer, CONTRACT_ADDRESS],
  });
}

// ---------------------------------------------------------------------------
// Transaction handler — core detection loop
// ---------------------------------------------------------------------------

export const handleTransaction: HandleTransaction = async (
  txEvent: TransactionEvent
): Promise<Finding[]> => {
  const findings: Finding[] = [];

  // Only care about logs from our contract
  const contractLogs = txEvent.logs.filter(
    (log) => log.address.toLowerCase() === CONTRACT_ADDRESS
  );

  if (contractLogs.length === 0) return findings;

  // Use transaction block timestamp (seconds) converted to ms
  // Forta provides txEvent.timestamp in seconds
  const nowMs = (txEvent.timestamp ?? Date.now() / 1000) * 1000;
  const txHash = txEvent.hash;

  for (const log of contractLogs) {
    const topic0 = log.topics[0];

    // -------------------------------------------------------------------
    // Rule 1: EnvelopeCommitted — per-issuer rate (issuer is topics[1])
    // -------------------------------------------------------------------
    if (topic0 === ENVELOPE_COMMITTED_TOPIC && log.topics.length >= 2) {
      const issuer = ("0x" + log.topics[1].slice(26)).toLowerCase();
      const events = recordEvent(
        commitWindow,
        issuer,
        { timestamp: nowMs, txHash },
        ONE_HOUR_MS
      );
      const count = events.length;

      if (count > COMMIT_THRESHOLD_CRITICAL) {
        const key = `commit-critical-${issuer}`;
        if (shouldAlert(key, nowMs)) {
          findings.push(
            commitRateAlert(
              issuer,
              count,
              latestTxHashes(events),
              FindingSeverity.Critical,
              "CRITICAL"
            )
          );
        }
      } else if (count > COMMIT_THRESHOLD_HIGH) {
        const key = `commit-high-${issuer}`;
        if (shouldAlert(key, nowMs)) {
          findings.push(
            commitRateAlert(
              issuer,
              count,
              latestTxHashes(events),
              FindingSeverity.High,
              "HIGH"
            )
          );
        }
      }
    }

    // -------------------------------------------------------------------
    // Rule 2: EnvelopeRevoked — per-revokedBy rate (revokedBy is topics[2])
    // -------------------------------------------------------------------
    if (topic0 === ENVELOPE_REVOKED_TOPIC && log.topics.length >= 3) {
      const revokedBy = ("0x" + log.topics[2].slice(26)).toLowerCase();
      const events = recordEvent(
        revokeWindow,
        revokedBy,
        { timestamp: nowMs, txHash },
        ONE_HOUR_MS
      );
      const count = events.length;

      if (count > REVOKE_THRESHOLD_CRITICAL) {
        const key = `revoke-critical-${revokedBy}`;
        if (shouldAlert(key, nowMs)) {
          findings.push(
            revokeRateAlert(
              revokedBy,
              count,
              latestTxHashes(events),
              FindingSeverity.Critical,
              "CRITICAL"
            )
          );
        }
      } else if (count > REVOKE_THRESHOLD_HIGH) {
        const key = `revoke-high-${revokedBy}`;
        if (shouldAlert(key, nowMs)) {
          findings.push(
            revokeRateAlert(
              revokedBy,
              count,
              latestTxHashes(events),
              FindingSeverity.High,
              "HIGH"
            )
          );
        }
      }
    }

    // -------------------------------------------------------------------
    // Rule 3: IssuerEpochAdvanced — per-issuer rate (issuer is topics[1])
    // -------------------------------------------------------------------
    if (topic0 === ISSUER_EPOCH_ADVANCED_TOPIC && log.topics.length >= 2) {
      const issuer = ("0x" + log.topics[1].slice(26)).toLowerCase();
      const events = recordEvent(
        epochWindow,
        issuer,
        { timestamp: nowMs, txHash },
        TWENTY_FOUR_HOURS_MS
      );
      const count = events.length;

      if (count > EPOCH_THRESHOLD_CRITICAL) {
        const key = `epoch-critical-${issuer}`;
        if (shouldAlert(key, nowMs)) {
          findings.push(
            epochRateAlert(
              issuer,
              count,
              latestTxHashes(events),
              FindingSeverity.Critical,
              "CRITICAL"
            )
          );
        }
      } else if (count > EPOCH_THRESHOLD_HIGH) {
        const key = `epoch-high-${issuer}`;
        if (shouldAlert(key, nowMs)) {
          findings.push(
            epochRateAlert(
              issuer,
              count,
              latestTxHashes(events),
              FindingSeverity.High,
              "HIGH"
            )
          );
        }
      }
    }
  }

  return findings;
};

// ---------------------------------------------------------------------------
// Block handler — periodic stale-window cleanup
// ---------------------------------------------------------------------------

export const handleBlock: HandleBlock = async (
  blockEvent: BlockEvent
): Promise<Finding[]> => {
  const nowMs = blockEvent.block.timestamp * 1000;

  // Prune all windows every block to keep memory bounded.
  // Arbitrum blocks are fast (~0.25s), so we only do full pruning every ~240 blocks (~60s).
  const blockNum = BigNumber.from(blockEvent.blockNumber).toNumber();
  if (blockNum % 240 !== 0) return [];

  for (const [key, events] of commitWindow.entries()) {
    const pruned = pruneWindow(events, ONE_HOUR_MS, nowMs);
    if (pruned.length === 0) {
      commitWindow.delete(key);
    } else {
      commitWindow.set(key, pruned);
    }
  }

  for (const [key, events] of revokeWindow.entries()) {
    const pruned = pruneWindow(events, ONE_HOUR_MS, nowMs);
    if (pruned.length === 0) {
      revokeWindow.delete(key);
    } else {
      revokeWindow.set(key, pruned);
    }
  }

  for (const [key, events] of epochWindow.entries()) {
    const pruned = pruneWindow(events, TWENTY_FOUR_HOURS_MS, nowMs);
    if (pruned.length === 0) {
      epochWindow.delete(key);
    } else {
      epochWindow.set(key, pruned);
    }
  }

  return [];
};

// ---------------------------------------------------------------------------
// Exports for testing (allow test helpers to reset state)
// ---------------------------------------------------------------------------

export function resetState(): void {
  commitWindow.clear();
  revokeWindow.clear();
  epochWindow.clear();
  lastAlertTime.clear();
}

export { commitWindow, revokeWindow, epochWindow };
