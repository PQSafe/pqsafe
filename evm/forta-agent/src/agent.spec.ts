/**
 * PQSafe Forta Agent — Unit Tests
 * ≥10 test cases covering all 3 circuit-breaker rules + edge cases.
 */

import {
  Finding,
  FindingSeverity,
  FindingType,
  TestTransactionEvent,
  TestBlockEvent,
} from "@forta/agent";
import { ethers } from "ethers";
import {
  handleTransaction,
  handleBlock,
  resetState,
  COMMIT_THRESHOLD_CRITICAL,
  COMMIT_THRESHOLD_HIGH,
  REVOKE_THRESHOLD_CRITICAL,
  REVOKE_THRESHOLD_HIGH,
  EPOCH_THRESHOLD_CRITICAL,
  EPOCH_THRESHOLD_HIGH,
  commitWindow,
  revokeWindow,
  epochWindow,
} from "./agent";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const CONTRACT = process.env.CONTRACT_ADDRESS?.toLowerCase() ?? "0x0000000000000000000000000000000000000000";

const ISSUER_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ISSUER_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const REVOKER = "0xcccccccccccccccccccccccccccccccccccccccc";

// Topic hashes (must match agent.ts)
const COMMITTED_TOPIC = ethers.utils.id(
  "EnvelopeCommitted(address,address,bytes32,bytes32,uint128,bytes3,uint64,bytes16,uint64,uint256)"
);
const REVOKED_TOPIC = ethers.utils.id(
  "EnvelopeRevoked(bytes32,address,bytes32)"
);
const EPOCH_TOPIC = ethers.utils.id(
  "IssuerEpochAdvanced(address,uint64,uint64)"
);

function pad32(addr: string): string {
  return ethers.utils.hexZeroPad(addr, 32);
}

const BASE_TIMESTAMP = 1_700_000_000; // seconds — fixed anchor for determinism

/**
 * Build a minimal mock TransactionEvent log entry for the registry contract.
 */
function makeCommitLog(issuer: string, timestampSec: number, txHash = "0xabc") {
  return {
    address: CONTRACT,
    topics: [COMMITTED_TOPIC, pad32(issuer), pad32(ISSUER_A), pad32("0x1234")],
    data: "0x",
    timestamp: timestampSec,
    txHash,
  };
}

function makeRevokeLog(revokedBy: string, timestampSec: number, txHash = "0xdef") {
  return {
    address: CONTRACT,
    topics: [REVOKED_TOPIC, pad32("0x9999"), pad32(revokedBy)],
    data: "0x",
    timestamp: timestampSec,
    txHash,
  };
}

function makeEpochLog(issuer: string, timestampSec: number, txHash = "0xeee") {
  return {
    address: CONTRACT,
    topics: [EPOCH_TOPIC, pad32(issuer)],
    data: "0x",
    timestamp: timestampSec,
    txHash,
  };
}

/**
 * Simulate N transaction events from the same issuer at the given timestamp.
 * Returns the findings from the Nth (last) tx.
 */
async function fireCommits(
  issuer: string,
  count: number,
  timestampSec: number
): Promise<Finding[]> {
  let findings: Finding[] = [];
  for (let i = 0; i < count; i++) {
    const txEvent = new TestTransactionEvent()
      .setHash(`0x${i.toString(16).padStart(64, "0")}`)
      .setTimestamp(timestampSec)
      .addEventLog(COMMITTED_TOPIC, CONTRACT, "0x", pad32(issuer), pad32(ISSUER_B), pad32("0xbeef"));
    findings = await handleTransaction(txEvent);
  }
  return findings;
}

async function fireRevocations(
  revokedBy: string,
  count: number,
  timestampSec: number
): Promise<Finding[]> {
  let findings: Finding[] = [];
  for (let i = 0; i < count; i++) {
    const txEvent = new TestTransactionEvent()
      .setHash(`0xr${i.toString(16).padStart(63, "0")}`)
      .setTimestamp(timestampSec)
      .addEventLog(REVOKED_TOPIC, CONTRACT, "0x", pad32("0x9999"), pad32(revokedBy));
    findings = await handleTransaction(txEvent);
  }
  return findings;
}

async function fireEpochAdvances(
  issuer: string,
  count: number,
  timestampSec: number
): Promise<Finding[]> {
  let findings: Finding[] = [];
  for (let i = 0; i < count; i++) {
    const txEvent = new TestTransactionEvent()
      .setHash(`0xe${i.toString(16).padStart(63, "0")}`)
      .setTimestamp(timestampSec)
      .addEventLog(EPOCH_TOPIC, CONTRACT, "0x", pad32(issuer));
    findings = await handleTransaction(txEvent);
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("PQSafe Forta Agent", () => {
  beforeEach(() => {
    resetState();
  });

  // ---- Rule 1: Commit rate -----------------------------------------------

  it("TC01: no finding below commit High threshold", async () => {
    const findings = await fireCommits(ISSUER_A, COMMIT_THRESHOLD_HIGH - 10, BASE_TIMESTAMP);
    expect(findings).toHaveLength(0);
  });

  it("TC02: High finding when commit count crosses High threshold (75%)", async () => {
    const findings = await fireCommits(ISSUER_A, COMMIT_THRESHOLD_HIGH + 1, BASE_TIMESTAMP);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const f = findings.find((f) => f.alertId === "PQSAFE-COMMIT-RATE-HIGH");
    expect(f).toBeDefined();
    expect(f!.severity).toBe(FindingSeverity.High);
    expect(f!.metadata.issuer.toLowerCase()).toBe(ISSUER_A.toLowerCase());
  });

  it("TC03: Critical finding when commit count crosses Critical threshold (1000)", async () => {
    const findings = await fireCommits(ISSUER_A, COMMIT_THRESHOLD_CRITICAL + 1, BASE_TIMESTAMP);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const f = findings.find((f) => f.alertId === "PQSAFE-COMMIT-RATE-CRITICAL");
    expect(f).toBeDefined();
    expect(f!.severity).toBe(FindingSeverity.Critical);
    expect(f!.metadata.rule).toBe("Rule1_CommitRate");
  });

  it("TC04: events from different issuers are tracked independently — no cross-contamination", async () => {
    // ISSUER_A gets Critical, ISSUER_B stays below
    await fireCommits(ISSUER_A, COMMIT_THRESHOLD_CRITICAL + 1, BASE_TIMESTAMP);
    const bFindings = await fireCommits(ISSUER_B, 5, BASE_TIMESTAMP);
    const criticalForB = bFindings.filter((f) => f.alertId === "PQSAFE-COMMIT-RATE-CRITICAL");
    expect(criticalForB).toHaveLength(0);
  });

  it("TC05: commits outside rolling 60min window do NOT count toward threshold", async () => {
    // Fire commits >1h ago
    await fireCommits(ISSUER_A, COMMIT_THRESHOLD_CRITICAL - 1, BASE_TIMESTAMP - 7200);
    // Recent commits under threshold
    const findings = await fireCommits(ISSUER_A, 10, BASE_TIMESTAMP);
    const critical = findings.filter((f) => f.alertId === "PQSAFE-COMMIT-RATE-CRITICAL");
    expect(critical).toHaveLength(0);
  });

  // ---- Rule 2: Revocation rate -------------------------------------------

  it("TC06: no finding below revoke High threshold", async () => {
    const findings = await fireRevocations(REVOKER, REVOKE_THRESHOLD_HIGH - 5, BASE_TIMESTAMP);
    expect(findings).toHaveLength(0);
  });

  it("TC07: High finding when revocations cross High threshold", async () => {
    const findings = await fireRevocations(REVOKER, REVOKE_THRESHOLD_HIGH + 1, BASE_TIMESTAMP);
    const f = findings.find((f) => f.alertId === "PQSAFE-REVOKE-RATE-HIGH");
    expect(f).toBeDefined();
    expect(f!.severity).toBe(FindingSeverity.High);
    expect(f!.metadata.revokedBy.toLowerCase()).toBe(REVOKER.toLowerCase());
  });

  it("TC08: Critical finding when revocations cross Critical threshold (100)", async () => {
    const findings = await fireRevocations(REVOKER, REVOKE_THRESHOLD_CRITICAL + 1, BASE_TIMESTAMP);
    const f = findings.find((f) => f.alertId === "PQSAFE-REVOKE-RATE-CRITICAL");
    expect(f).toBeDefined();
    expect(f!.severity).toBe(FindingSeverity.Critical);
    expect(f!.metadata.rule).toBe("Rule2_RevokeRate");
  });

  // ---- Rule 3: Epoch advance rate ----------------------------------------

  it("TC09: High finding when epoch advances cross High threshold in 24h", async () => {
    const findings = await fireEpochAdvances(ISSUER_A, EPOCH_THRESHOLD_HIGH + 1, BASE_TIMESTAMP);
    const f = findings.find((f) => f.alertId === "PQSAFE-EPOCH-RATE-HIGH");
    expect(f).toBeDefined();
    expect(f!.severity).toBe(FindingSeverity.High);
  });

  it("TC10: Critical finding when epoch advances exceed 5 in 24h", async () => {
    const findings = await fireEpochAdvances(ISSUER_A, EPOCH_THRESHOLD_CRITICAL + 1, BASE_TIMESTAMP);
    const f = findings.find((f) => f.alertId === "PQSAFE-EPOCH-RATE-CRITICAL");
    expect(f).toBeDefined();
    expect(f!.severity).toBe(FindingSeverity.Critical);
    expect(f!.metadata.timeframe).toBe("24h");
    expect(f!.metadata.rule).toBe("Rule3_EpochRate");
  });

  it("TC11: epoch advances older than 24h are pruned — no false alert", async () => {
    // Advances >24h ago
    await fireEpochAdvances(ISSUER_A, EPOCH_THRESHOLD_CRITICAL - 1, BASE_TIMESTAMP - 90000);
    // Recent advance under threshold
    const findings = await fireEpochAdvances(ISSUER_A, 1, BASE_TIMESTAMP);
    const critical = findings.filter((f) => f.alertId === "PQSAFE-EPOCH-RATE-CRITICAL");
    expect(critical).toHaveLength(0);
  });

  // ---- Metadata & multi-rule ------------------------------------------------

  it("TC12: Critical finding metadata contains txHashes array", async () => {
    const findings = await fireCommits(ISSUER_A, COMMIT_THRESHOLD_CRITICAL + 1, BASE_TIMESTAMP);
    const f = findings.find((f) => f.alertId === "PQSAFE-COMMIT-RATE-CRITICAL");
    expect(f).toBeDefined();
    const hashes = JSON.parse(f!.metadata.txHashes);
    expect(Array.isArray(hashes)).toBe(true);
    expect(hashes.length).toBeGreaterThan(0);
  });

  it("TC13: logs from non-contract address are ignored", async () => {
    const OTHER = "0xffffffffffffffffffffffffffffffffffffffff";
    const txEvent = new TestTransactionEvent()
      .setHash("0xignore")
      .setTimestamp(BASE_TIMESTAMP)
      .addEventLog(COMMITTED_TOPIC, OTHER, "0x", pad32(ISSUER_A), pad32(ISSUER_B), pad32("0xbeef"));
    const findings = await handleTransaction(txEvent);
    expect(findings).toHaveLength(0);
    expect(commitWindow.get(ISSUER_A.toLowerCase())).toBeUndefined();
  });

  it("TC14: handleBlock returns empty findings (block events are cleanup-only)", async () => {
    const blockEvent = new TestBlockEvent().setNumber(240).setTimestamp(BASE_TIMESTAMP);
    const findings = await handleBlock(blockEvent);
    expect(findings).toHaveLength(0);
  });
});
