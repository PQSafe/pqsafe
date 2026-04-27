/**
 * PQSafe — Tenderly Web3 Action: Circuit Breaker
 *
 * Triggered by Tenderly alerts on SpendEnvelopeRegistryV2_1 events:
 *   - EnvelopeCommitted  → track per-issuer commit rate  (Rule 1: >1000/hr)
 *   - EnvelopeRevoked    → track per-revoker revoke rate (Rule 2: >100/hr)
 *   - EpochAdvanced      → track per-issuer epoch rate   (Rule 3: >5/24h)
 *
 * State is persisted in Tenderly KV store (key-value with TTL support).
 * On threshold breach: POST to Cloudflare Worker pause-relay.
 *
 * @see https://docs.tenderly.co/web3-actions/references/action-functions-events-and-triggers
 */

import {
  ActionFn,
  Context,
  Event,
  TransactionEvent,
  Log,
} from "@tenderly/actions";
import { ethers } from "ethers";

// ---------------------------------------------------------------------------
// Config (injected via Tenderly Action secrets / env)
// ---------------------------------------------------------------------------

const CONTRACT_ADDRESS_KEY = "CONTRACT_ADDRESS";
const PAUSE_RELAY_URL_KEY = "PAUSE_RELAY_URL";
const RELAY_HMAC_SECRET_KEY = "RELAY_HMAC_SECRET";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const COMMIT_THRESHOLD = 1000;     // >1000/hr  → Critical
const REVOKE_THRESHOLD = 100;      // >100/hr   → Critical
const EPOCH_THRESHOLD  = 5;        // >5/24h    → Critical
const COMMIT_HIGH      = 750;      // >750/hr   → High
const REVOKE_HIGH      = 75;       // >75/hr    → High
const EPOCH_HIGH       = 4;        // >4/24h    → High

const ONE_HOUR_S   = 3600;
const ONE_DAY_S    = 86400;

// ---------------------------------------------------------------------------
// KV key helpers
// ---------------------------------------------------------------------------

/** Sorted-set style: store each event as "ts:txHash" under a list key. */
const KV_COMMIT_PREFIX = "pqsafe:commits:";
const KV_REVOKE_PREFIX  = "pqsafe:revokes:";
const KV_EPOCH_PREFIX   = "pqsafe:epochs:";

/** Compact timestamp-hash entries stored as newline-delimited string. */
interface EventRecord {
  ts: number;       // Unix seconds
  txHash: string;
}

async function readRecords(ctx: Context, key: string): Promise<EventRecord[]> {
  try {
    const raw = await ctx.storage.getStr(key);
    if (!raw) return [];
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [ts, txHash] = line.split("|");
        return { ts: parseInt(ts, 10), txHash };
      });
  } catch {
    return [];
  }
}

async function writeRecords(ctx: Context, key: string, records: EventRecord[]): Promise<void> {
  const serialized = records.map((r) => `${r.ts}|${r.txHash}`).join("\n");
  await ctx.storage.putStr(key, serialized);
}

function pruneOlderThan(records: EventRecord[], windowS: number, nowS: number): EventRecord[] {
  return records.filter((r) => nowS - r.ts <= windowS);
}

// ---------------------------------------------------------------------------
// HMAC signing (SHA-256 via Web Crypto)
// ---------------------------------------------------------------------------

async function hmacSign(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", keyMaterial, encoder.encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Payload types for Cloudflare Worker
// ---------------------------------------------------------------------------

type AlertSeverity = "Critical" | "High";

interface PauseRelayPayload {
  source: "tenderly";
  severity: AlertSeverity;
  rule: string;
  address: string;
  count: number;
  timeframe: string;
  txHashes: string[];
  timestamp: number;
  contractAddress: string;
}

// ---------------------------------------------------------------------------
// Fire webhook
// ---------------------------------------------------------------------------

async function sendToRelay(
  ctx: Context,
  payload: PauseRelayPayload
): Promise<void> {
  const relayUrl = await ctx.secrets.get(PAUSE_RELAY_URL_KEY);
  const hmacSecret = await ctx.secrets.get(RELAY_HMAC_SECRET_KEY);

  if (!relayUrl) {
    console.error("[circuit-breaker] PAUSE_RELAY_URL not configured — skipping relay call");
    return;
  }

  const body = JSON.stringify(payload);
  const sig = hmacSecret ? await hmacSign(hmacSecret, body) : "";

  const resp = await fetch(relayUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PQSafe-Signature": sig,
    },
    body,
  });

  if (!resp.ok) {
    console.error(
      `[circuit-breaker] Relay responded ${resp.status}: ${await resp.text()}`
    );
  } else {
    console.log(`[circuit-breaker] Relay accepted ${payload.severity} alert for rule ${payload.rule}`);
  }
}

// ---------------------------------------------------------------------------
// Event topic hashes
// ---------------------------------------------------------------------------

const COMMITTED_TOPIC = ethers.utils.id(
  "EnvelopeCommitted(address,address,bytes32,bytes32,uint128,bytes3,uint64,bytes16,uint64,uint256)"
);
const REVOKED_TOPIC = ethers.utils.id(
  "EnvelopeRevoked(bytes32,address,bytes32)"
);
const EPOCH_TOPIC = ethers.utils.id(
  "IssuerEpochAdvanced(address,uint64,uint64)"
);

// ---------------------------------------------------------------------------
// Main action function
// ---------------------------------------------------------------------------

export const circuitBreakerAction: ActionFn = async (
  context: Context,
  event: Event
): Promise<void> => {
  const txEvent = event as TransactionEvent;

  const contractAddress = (
    (await context.secrets.get(CONTRACT_ADDRESS_KEY)) ?? ""
  ).toLowerCase();

  if (!contractAddress) {
    console.error("[circuit-breaker] CONTRACT_ADDRESS secret not set");
    return;
  }

  const nowS = Math.floor(Date.now() / 1000);
  const txHash = txEvent.hash;

  // Filter logs to our contract
  const logs: Log[] = (txEvent.logs ?? []).filter(
    (log) => log.address.toLowerCase() === contractAddress
  );

  for (const log of logs) {
    const topic0 = log.topics[0];

    // -----------------------------------------------------------------------
    // Rule 1: EnvelopeCommitted — issuer is topics[1]
    // -----------------------------------------------------------------------
    if (topic0 === COMMITTED_TOPIC && log.topics.length >= 2) {
      const issuer = ("0x" + log.topics[1].slice(26)).toLowerCase();
      const key = `${KV_COMMIT_PREFIX}${issuer}`;

      let records = await readRecords(context, key);
      records.push({ ts: nowS, txHash });
      records = pruneOlderThan(records, ONE_HOUR_S, nowS);
      await writeRecords(context, key, records);

      const count = records.length;
      const txHashes = [...new Set(records.map((r) => r.txHash))].slice(-10);

      if (count > COMMIT_THRESHOLD) {
        console.log(`[Rule1] CRITICAL: issuer ${issuer} committed ${count}/hr`);
        await sendToRelay(context, {
          source: "tenderly",
          severity: "Critical",
          rule: "Rule1_CommitRate",
          address: issuer,
          count,
          timeframe: "60min",
          txHashes,
          timestamp: nowS,
          contractAddress,
        });
      } else if (count > COMMIT_HIGH) {
        console.log(`[Rule1] HIGH: issuer ${issuer} committed ${count}/hr (approaching threshold)`);
        await sendToRelay(context, {
          source: "tenderly",
          severity: "High",
          rule: "Rule1_CommitRate",
          address: issuer,
          count,
          timeframe: "60min",
          txHashes,
          timestamp: nowS,
          contractAddress,
        });
      }
    }

    // -----------------------------------------------------------------------
    // Rule 2: EnvelopeRevoked — revokedBy is topics[2]
    // -----------------------------------------------------------------------
    if (topic0 === REVOKED_TOPIC && log.topics.length >= 3) {
      const revokedBy = ("0x" + log.topics[2].slice(26)).toLowerCase();
      const key = `${KV_REVOKE_PREFIX}${revokedBy}`;

      let records = await readRecords(context, key);
      records.push({ ts: nowS, txHash });
      records = pruneOlderThan(records, ONE_HOUR_S, nowS);
      await writeRecords(context, key, records);

      const count = records.length;
      const txHashes = [...new Set(records.map((r) => r.txHash))].slice(-10);

      if (count > REVOKE_THRESHOLD) {
        console.log(`[Rule2] CRITICAL: revoker ${revokedBy} revoked ${count}/hr`);
        await sendToRelay(context, {
          source: "tenderly",
          severity: "Critical",
          rule: "Rule2_RevokeRate",
          address: revokedBy,
          count,
          timeframe: "60min",
          txHashes,
          timestamp: nowS,
          contractAddress,
        });
      } else if (count > REVOKE_HIGH) {
        console.log(`[Rule2] HIGH: revoker ${revokedBy} revoked ${count}/hr`);
        await sendToRelay(context, {
          source: "tenderly",
          severity: "High",
          rule: "Rule2_RevokeRate",
          address: revokedBy,
          count,
          timeframe: "60min",
          txHashes,
          timestamp: nowS,
          contractAddress,
        });
      }
    }

    // -----------------------------------------------------------------------
    // Rule 3: IssuerEpochAdvanced — issuer is topics[1]
    // -----------------------------------------------------------------------
    if (topic0 === EPOCH_TOPIC && log.topics.length >= 2) {
      const issuer = ("0x" + log.topics[1].slice(26)).toLowerCase();
      const key = `${KV_EPOCH_PREFIX}${issuer}`;

      let records = await readRecords(context, key);
      records.push({ ts: nowS, txHash });
      records = pruneOlderThan(records, ONE_DAY_S, nowS);
      await writeRecords(context, key, records);

      const count = records.length;
      const txHashes = [...new Set(records.map((r) => r.txHash))].slice(-10);

      if (count > EPOCH_THRESHOLD) {
        console.log(`[Rule3] CRITICAL: issuer ${issuer} advanced epoch ${count} times in 24h`);
        await sendToRelay(context, {
          source: "tenderly",
          severity: "Critical",
          rule: "Rule3_EpochRate",
          address: issuer,
          count,
          timeframe: "24h",
          txHashes,
          timestamp: nowS,
          contractAddress,
        });
      } else if (count > EPOCH_HIGH) {
        console.log(`[Rule3] HIGH: issuer ${issuer} advanced epoch ${count} times in 24h`);
        await sendToRelay(context, {
          source: "tenderly",
          severity: "High",
          rule: "Rule3_EpochRate",
          address: issuer,
          count,
          timeframe: "24h",
          txHashes,
          timestamp: nowS,
          contractAddress,
        });
      }
    }
  }
};
