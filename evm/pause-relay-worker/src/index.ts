/**
 * PQSafe Pause-Relay — Cloudflare Worker
 *
 * Receives webhook POSTs from Forta (via /forta) and Tenderly (/webhook).
 * Routes by severity:
 *   Critical → pause() the registry contract (auto-pause path or Safe-propose path)
 *   High     → post alert to BetterStack + Slack
 *   Medium   → audit log only
 *
 * Security: all inbound requests validated with HMAC-SHA256 over the raw body.
 * The pause-relay signer holds only PAUSER_ROLE (can pause, cannot unpause).
 *
 * ## Pause mode (controlled by AUTO_PAUSE_MODE env var):
 *
 *   AUTO_PAUSE_MODE=true  (DEFAULT for production)
 *     Worker holds PAUSER_ROLE directly.
 *     On Critical alert: signs + sends registry.pause() directly via ethers.
 *     Fastest possible response: ~15s (Forta detection + Worker dispatch + Arbitrum confirmation).
 *     UNPAUSE requires human action: Raymond or Tris signs Safe transaction (2-of-3).
 *
 *   AUTO_PAUSE_MODE=false  (legacy Safe-propose path)
 *     Worker proposes pause() to Gnosis Safe Transaction Service.
 *     Requires 2-of-3 multi-sig to actually execute.
 *     Slower but preserves human-in-the-loop for pause as well.
 *
 * Rule: auto-pause is fine (protecting users); unpause requires human (safety).
 * Reference: memory/feedback_human_only_when_required.md
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Env {
  /** KV namespace for deduplication */
  ALERT_KV: KVNamespace;
  /** Shared HMAC-SHA256 secret (same value in Forta + Tenderly configs) */
  RELAY_HMAC_SECRET: string;
  /** Gnosis Safe Transaction Service URL for Arbitrum */
  SAFE_TX_SERVICE_URL: string;
  /** Gnosis Safe address (2-of-3 multi-sig) */
  SAFE_ADDRESS: string;
  /** Private key of the Cloudflare Worker signer (holds PAUSER_ROLE) */
  SAFE_OWNER_KEY: string;
  /** V2.1 registry contract address */
  CONTRACT_ADDRESS: string;
  /** BetterStack Heartbeats API token */
  BETTERSTACK_TOKEN: string;
  /** Slack incoming webhook URL */
  SLACK_WEBHOOK_URL: string;
  /** Set to "true" to skip actual tx submission (staging/testing) */
  DRY_RUN?: string;
  /**
   * Pause mode toggle:
   *   "true" (default)  — direct PAUSER_ROLE call via ethers (fast, ~15s)
   *   "false"           — Safe-propose path (requires 2-of-3 multi-sig to execute)
   */
  AUTO_PAUSE_MODE?: string;
}

type Severity = "Critical" | "High" | "Medium" | "Low";
type AlertSource = "forta" | "tenderly";

interface AlertPayload {
  source: AlertSource;
  severity: Severity;
  rule: string;
  address: string;
  count: number;
  timeframe: string;
  txHashes: string[];
  timestamp: number;
  contractAddress: string;
  /** Forta-specific fields */
  alertId?: string;
  metadata?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// HMAC validation
// ---------------------------------------------------------------------------

async function verifyHmac(
  secret: string,
  body: string,
  signature: string
): Promise<boolean> {
  if (!secret || !signature) return false;
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = hexToUint8Array(signature);
  return crypto.subtle.verify("HMAC", keyMaterial, sigBytes, encoder.encode(body));
}

function hexToUint8Array(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Deduplication (5-minute cooldown per rule+address key)
// ---------------------------------------------------------------------------

const DEDUP_TTL_S = 300; // 5 minutes

async function isDuplicate(kv: KVNamespace, key: string): Promise<boolean> {
  const existing = await kv.get(key);
  return existing !== null;
}

async function markSeen(kv: KVNamespace, key: string): Promise<void> {
  await kv.put(key, "1", { expirationTtl: DEDUP_TTL_S });
}

// ---------------------------------------------------------------------------
// pause() function selector: keccak256("pause()")[0:4] = 0x8456cb59
// ---------------------------------------------------------------------------

const PAUSE_SELECTOR = "0x8456cb59";

// ---------------------------------------------------------------------------
// Path A: Direct pause via PAUSER_ROLE (AUTO_PAUSE_MODE=true)
// ---------------------------------------------------------------------------

/**
 * Directly call registry.pause() as the PAUSER_ROLE signer.
 * Returns the on-chain transaction hash.
 * Logs to console + BetterStack + Tenderly audit.
 *
 * Retries once on revert/network error before surfacing the error.
 */
export async function directPause(
  workerSignerKey: string,
  registryAddress: string,
  isDryRun: boolean,
  rpcUrl = "https://arb1.arbitrum.io/rpc"
): Promise<string> {
  if (isDryRun) {
    console.log("[pause-relay] DRY_RUN=true — skipping direct pause() call");
    return "dry-run-direct-pause-tx-hash";
  }

  const { ethers } = await import("ethers");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(workerSignerKey, provider);

  const pauseAbi = [
    "function pause() external",
    "function paused() external view returns (bool)",
  ];
  const registry = new ethers.Contract(registryAddress, pauseAbi, signer);

  // Check if already paused (avoid wasting gas)
  const alreadyPaused = await (registry.paused as () => Promise<boolean>)();
  if (alreadyPaused) {
    console.log("[pause-relay] Contract already paused — no-op");
    return "already-paused";
  }

  // Estimate gas first (catches reverts before sending)
  let gasEstimate: bigint;
  try {
    gasEstimate = await (registry.pause as { estimateGas: () => Promise<bigint> }).estimateGas();
  } catch (err) {
    // Retry once in case of transient RPC failure
    console.warn(`[pause-relay] gas estimation failed on first try: ${String(err)} — retrying`);
    gasEstimate = await (registry.pause as { estimateGas: () => Promise<bigint> }).estimateGas();
  }

  // Send with 20% gas buffer
  const gasLimit = (gasEstimate * 120n) / 100n;
  let tx: { hash: string; wait: () => Promise<unknown> };
  try {
    tx = await (registry.pause as (opts: { gasLimit: bigint }) => Promise<{ hash: string; wait: () => Promise<unknown> }>)({ gasLimit });
  } catch (err) {
    // Single retry on revert
    console.warn(`[pause-relay] pause() tx failed on first attempt: ${String(err)} — retrying`);
    tx = await (registry.pause as (opts: { gasLimit: bigint }) => Promise<{ hash: string; wait: () => Promise<unknown> }>)({ gasLimit });
  }

  console.log(`[pause-relay] pause() submitted: txHash=${tx.hash} gasLimit=${gasLimit}`);

  // Wait for 1 confirmation
  await tx.wait();
  console.log(`[pause-relay] pause() confirmed: txHash=${tx.hash}`);

  return tx.hash;
}

// ---------------------------------------------------------------------------
// Path B: Safe-propose path (AUTO_PAUSE_MODE=false)
// ---------------------------------------------------------------------------

interface SafeTxData {
  to: string;
  value: string;
  data: string;
  operation: number;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: string;
  nonce: number;
}

async function fetchSafeNonce(
  safeTxServiceUrl: string,
  safeAddress: string
): Promise<number> {
  const url = `${safeTxServiceUrl}/api/v1/safes/${safeAddress}/`;
  const resp = await fetch(url, { headers: { Accept: "application/json" } });
  if (!resp.ok) throw new Error(`Safe API error ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as { nonce: number };
  return data.nonce;
}

async function proposePauseTx(env: Env): Promise<string> {
  const isDryRun = env.DRY_RUN === "true";

  if (isDryRun) {
    console.log("[pause-relay] DRY_RUN=true — skipping Safe tx submission");
    return "dry-run-tx-hash";
  }

  const { ethers } = await import("ethers");
  const provider = new ethers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");
  const signer = new ethers.Wallet(env.SAFE_OWNER_KEY, provider);

  // Fetch current Safe nonce
  const nonce = await fetchSafeNonce(env.SAFE_TX_SERVICE_URL, env.SAFE_ADDRESS);

  const txData: SafeTxData = {
    to: env.CONTRACT_ADDRESS,
    value: "0",
    data: PAUSE_SELECTOR,
    operation: 0, // CALL
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
    nonce,
  };

  // Compute Safe transaction hash (EIP-712)
  const SAFE_TX_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      "SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)"
    )
  );

  const encodedTx = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "bytes32",
      "address",
      "uint256",
      "bytes32",
      "uint8",
      "uint256",
      "uint256",
      "uint256",
      "address",
      "address",
      "uint256",
    ],
    [
      SAFE_TX_TYPEHASH,
      txData.to,
      txData.value,
      ethers.keccak256(txData.data),
      txData.operation,
      txData.safeTxGas,
      txData.baseGas,
      txData.gasPrice,
      txData.gasToken,
      txData.refundReceiver,
      txData.nonce,
    ]
  );

  // Sign the transaction hash
  const safeTxHash = ethers.keccak256(encodedTx);
  const signature = await signer.signMessage(ethers.getBytes(safeTxHash));

  // Submit to Safe Transaction Service
  const submitUrl = `${env.SAFE_TX_SERVICE_URL}/api/v1/safes/${env.SAFE_ADDRESS}/multisig-transactions/`;
  const submitResp = await fetch(submitUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...txData,
      contractTransactionHash: safeTxHash,
      sender: signer.address,
      signature,
      origin: "pqsafe-pause-relay-worker",
    }),
  });

  if (!submitResp.ok) {
    const errText = await submitResp.text();
    throw new Error(`Safe tx submission failed ${submitResp.status}: ${errText}`);
  }

  return safeTxHash;
}

// ---------------------------------------------------------------------------
// Alerting helpers
// ---------------------------------------------------------------------------

async function postToSlack(webhookUrl: string, message: string): Promise<void> {
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
}

async function postToBetterStack(token: string, payload: AlertPayload): Promise<void> {
  if (!token) return;
  await fetch("https://uptime.betterstack.com/api/v2/incidents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: `PQSafe ${payload.severity}: ${payload.rule}`,
      summary: `Address ${payload.address} — ${payload.count} events in ${payload.timeframe}`,
      severity: payload.severity === "Critical" ? "critical" : "warning",
    }),
  });
}

// ---------------------------------------------------------------------------
// Severity router
// ---------------------------------------------------------------------------

async function handleCritical(env: Env, payload: AlertPayload): Promise<Response> {
  const dedupeKey = `critical:${payload.rule}:${payload.address}`;

  if (await isDuplicate(env.ALERT_KV, dedupeKey)) {
    console.log(`[pause-relay] Deduped critical alert: ${dedupeKey}`);
    return new Response(JSON.stringify({ status: "deduplicated" }), { status: 200 });
  }

  await markSeen(env.ALERT_KV, dedupeKey);

  // Determine pause mode: AUTO_PAUSE_MODE defaults to "true" (direct pause)
  const autoPauseMode = env.AUTO_PAUSE_MODE !== "false";
  const isDryRun = env.DRY_RUN === "true";

  let pauseTxHash = "";
  let pauseError = "";
  let pauseMode: "auto" | "safe-propose";

  if (autoPauseMode) {
    // Path A: Direct PAUSER_ROLE call — fast (~15s end-to-end)
    pauseMode = "auto";
    try {
      pauseTxHash = await directPause(
        env.SAFE_OWNER_KEY,
        env.CONTRACT_ADDRESS,
        isDryRun
      );
      console.log(`[pause-relay] AUTO-PAUSE direct txHash=${pauseTxHash}`);
    } catch (err) {
      pauseError = String(err);
      console.error(`[pause-relay] AUTO-PAUSE FAILED: ${pauseError}`);
    }
  } else {
    // Path B: Safe Transaction Service propose — requires 2-of-3 multi-sig
    pauseMode = "safe-propose";
    try {
      pauseTxHash = await proposePauseTx(env);
      console.log(`[pause-relay] Safe pause() proposed: safeTxHash=${pauseTxHash}`);
    } catch (err) {
      pauseError = String(err);
      console.error(`[pause-relay] Safe pause() proposal FAILED: ${pauseError}`);
    }
  }

  const pauseLabel = pauseMode === "auto" ? "Auto-Pause TX" : "Safe TX (proposed)";
  const slackMsg =
    `🚨 *PQSafe CRITICAL — ${payload.rule}*\n` +
    `Address: \`${payload.address}\`\n` +
    `Count: ${payload.count} in ${payload.timeframe}\n` +
    `Contract: \`${payload.contractAddress}\`\n` +
    `Source: ${payload.source}\n` +
    `Mode: ${pauseMode === "auto" ? "⚡ AUTO-PAUSE (direct PAUSER_ROLE)" : "🔐 Safe-propose (2-of-3 required)"}\n` +
    (pauseTxHash
      ? `${pauseLabel}: \`${pauseTxHash}\``
      : `*pause() FAILED*: ${pauseError}`);

  await postToSlack(env.SLACK_WEBHOOK_URL, slackMsg);

  if (!pauseError) {
    await postToBetterStack(env.BETTERSTACK_TOKEN, payload);
  }

  return new Response(
    JSON.stringify({
      status: "critical-processed",
      pauseMode,
      pauseTxHash: pauseTxHash || null,
      pauseError: pauseError || null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

async function handleHigh(env: Env, payload: AlertPayload): Promise<Response> {
  const dedupeKey = `high:${payload.rule}:${payload.address}`;

  if (await isDuplicate(env.ALERT_KV, dedupeKey)) {
    return new Response(JSON.stringify({ status: "deduplicated" }), { status: 200 });
  }

  await markSeen(env.ALERT_KV, dedupeKey);

  // High severity: alert only — no pause (auto or otherwise)
  // Per rule: auto-pause only on Critical; High = alert + Safe-propose-ready (human decides)
  const slackMsg =
    `⚠️ *PQSafe HIGH — ${payload.rule}*\n` +
    `Address: \`${payload.address}\`\n` +
    `Count: ${payload.count} in ${payload.timeframe} (approaching Critical threshold)\n` +
    `Source: ${payload.source}\n` +
    `_No auto-pause — monitor closely. If escalates to Critical, Worker will auto-pause._`;

  await postToSlack(env.SLACK_WEBHOOK_URL, slackMsg);
  await postToBetterStack(env.BETTERSTACK_TOKEN, payload);

  return new Response(
    JSON.stringify({ status: "high-alerted" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

async function handleMedium(env: Env, payload: AlertPayload): Promise<Response> {
  // Audit log only — console output goes to Cloudflare Workers log tail
  console.log(
    `[pause-relay] MEDIUM: rule=${payload.rule} address=${payload.address} ` +
    `count=${payload.count} source=${payload.source}`
  );
  return new Response(JSON.stringify({ status: "logged" }), { status: 200 });
}

// ---------------------------------------------------------------------------
// Request parsing — normalize Forta and Tenderly webhook schemas
// ---------------------------------------------------------------------------

async function parseForta(body: string): Promise<AlertPayload | null> {
  try {
    const raw = JSON.parse(body) as {
      severity?: string;
      alertId?: string;
      metadata?: Record<string, string>;
      addresses?: string[];
    };

    const severity = normalizeSeverity(raw.severity ?? "");
    if (!severity) return null;

    return {
      source: "forta",
      severity,
      rule: raw.metadata?.rule ?? raw.alertId ?? "unknown",
      address: raw.metadata?.issuer ?? raw.metadata?.revokedBy ?? (raw.addresses?.[0] ?? ""),
      count: parseInt(raw.metadata?.count ?? "0", 10),
      timeframe: raw.metadata?.timeframe ?? "unknown",
      txHashes: JSON.parse(raw.metadata?.txHashes ?? "[]"),
      timestamp: Math.floor(Date.now() / 1000),
      contractAddress: raw.addresses?.[1] ?? "",
      alertId: raw.alertId,
      metadata: raw.metadata,
    };
  } catch {
    return null;
  }
}

async function parseTenderly(body: string): Promise<AlertPayload | null> {
  try {
    const raw = JSON.parse(body) as AlertPayload;
    if (raw.source !== "tenderly") return null;
    return raw;
  } catch {
    return null;
  }
}

function normalizeSeverity(raw: string): Severity | null {
  const upper = raw.toUpperCase();
  if (upper === "CRITICAL") return "Critical";
  if (upper === "HIGH") return "High";
  if (upper === "MEDIUM") return "Medium";
  if (upper === "LOW") return "Low";
  return null;
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      const autoPauseMode = env.AUTO_PAUSE_MODE !== "false";
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "pqsafe-pause-relay",
          pauseMode: autoPauseMode ? "auto" : "safe-propose",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Only accept POST to /forta or /webhook
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const isForta = url.pathname === "/forta";
    const isTenderly = url.pathname === "/webhook";

    if (!isForta && !isTenderly) {
      return new Response("Not Found", { status: 404 });
    }

    // Read raw body for HMAC validation
    const rawBody = await request.text();

    // Validate HMAC-SHA256 signature
    const signature =
      request.headers.get("X-PQSafe-Signature") ??
      request.headers.get("x-pqsafe-signature") ??
      "";

    const isValid = await verifyHmac(env.RELAY_HMAC_SECRET, rawBody, signature);
    if (!isValid) {
      console.warn("[pause-relay] HMAC validation failed — rejecting request");
      return new Response("Unauthorized", { status: 401 });
    }

    // Parse payload
    const payload = isForta
      ? await parseForta(rawBody)
      : await parseTenderly(rawBody);

    if (!payload) {
      return new Response(
        JSON.stringify({ error: "Invalid or unrecognized payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Route by severity
    switch (payload.severity) {
      case "Critical":
        return handleCritical(env, payload);
      case "High":
        return handleHigh(env, payload);
      case "Medium":
      case "Low":
      default:
        return handleMedium(env, payload);
    }
  },
};
