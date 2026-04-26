/**
 * PQSafe AgentPay — First-class Human-in-the-Loop Approval API
 *
 * Promotes the previous Telegram-only approval stub into a full multi-channel
 * approval gate with quorum support, audit trail, and SDK-level integration.
 *
 * ## Supported channels
 *   - telegram   — inline keyboard bot (full implementation, mock-mode friendly)
 *   - slack      — Block Kit webhook (full implementation)
 *   - webhook    — HMAC-signed POST to any URL (full implementation)
 *   - email      — stub (real impl needs SMTP relay; deferred to Sprint 4)
 *   - discord    — stub (deferred)
 *   - sms        — stub (deferred)
 *   - whatsapp   — stub (deferred)
 *
 * ## Usage (single channel)
 *   import { requestApproval } from '@pqsafe/agent-pay/approval'
 *   const result = await requestApproval({
 *     envelope: signed,
 *     paymentRequest: { recipient: 'anthropic.com/billing', amount: 499, memo: 'API credits' },
 *     approvers: [{ name: 'telegram', config: { botToken: '...', chatId: '...' } }],
 *     threshold: 1,
 *     timeoutSec: 600,
 *     humanReadableSummary: 'Pay $499 to Anthropic for API credits',
 *     riskScore: 'medium',
 *   })
 *
 * ## Usage (legacy convenience wrapper — unchanged for back-compat)
 *   import { executeWithApproval } from '@pqsafe/agent-pay/approval'
 */

import { createHash, createHmac, timingSafeEqual } from 'crypto'
import { executeAgentPayment, verifyEnvelope } from './index.js'
import type { SignedEnvelope, PaymentRequest, PaymentResult } from './types.js'

// ---------------------------------------------------------------------------
// Channel config types
// ---------------------------------------------------------------------------

export interface TelegramConfig {
  /** Telegram bot token from @BotFather */
  botToken: string
  /** Chat ID (personal DM, group, or channel) */
  chatId: string
}

export interface SlackConfig {
  /** Slack incoming webhook URL */
  webhookUrl: string
  /** Optional channel override (e.g. "#payments-approval") */
  channel?: string
}

export interface EmailConfig {
  /** SMTP-capable email address to send to */
  to: string
  /** Optional subject override */
  subject?: string
  // NOTE: Email sending is stubbed — set PQSAFE_SMTP_* vars when Sprint 4 lands
}

export interface WebhookConfig {
  /** URL to POST the approval request to */
  url: string
  /** Shared HMAC-SHA256 secret — if set, X-PQSafe-Signature header is sent */
  secret?: string
  /** Timeout for the webhook response in ms (default: 30_000) */
  timeoutMs?: number
}

export interface DiscordConfig {
  webhookUrl: string
}

export interface SmsConfig {
  phoneNumber: string
  // Deferred — will need Twilio or similar
}

export interface WhatsappConfig {
  phoneNumber: string
  // Deferred — will need WhatsApp Business API
}

export type ApprovalChannelConfig =
  | TelegramConfig
  | SlackConfig
  | EmailConfig
  | WebhookConfig
  | DiscordConfig
  | SmsConfig
  | WhatsappConfig

export interface ApprovalChannel {
  name: 'telegram' | 'slack' | 'email' | 'webhook' | 'discord' | 'sms' | 'whatsapp'
  config: ApprovalChannelConfig
}

// ---------------------------------------------------------------------------
// Approval request / result types
// ---------------------------------------------------------------------------

export interface ApprovalAuditEntry {
  /** sha256 of canonical request bytes */
  approvalRequestId: string
  /** Approver identifier (telegram user_id, slack user, email, webhook caller) */
  approverIdentifier: string
  channel: ApprovalChannel['name']
  /** Unix ms */
  timestamp: number
  decision: 'approved' | 'rejected' | 'expired' | 'error'
  responseTimeMs: number
  /** Raw response metadata from channel (stringified) */
  meta?: string
}

export interface ApprovalRequest {
  /** The signed envelope being approved */
  envelope: SignedEnvelope
  /** The payment request being authorized */
  paymentRequest: PaymentRequest
  /** Channels to send the approval request through */
  approvers: ApprovalChannel[]
  /** N-of-M approvals required (default: 1) */
  threshold?: number
  /** Seconds before auto-deny (default: 600 = 10 min) */
  timeoutSec?: number
  /** Human-readable summary shown to approvers */
  humanReadableSummary: string
  /** Risk level — shown to approvers for context */
  riskScore?: 'low' | 'medium' | 'high' | 'critical'
}

export interface ApprovalResult {
  status: 'approved' | 'rejected' | 'expired' | 'pending'
  approvedBy: string[]
  rejectedBy: string[]
  /** Unix ms when final decision was reached (or 0 if pending/expired) */
  approvedAt: number
  auditLog: ApprovalAuditEntry[]
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class ApprovalRejectedError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly amount: number,
    public readonly currency: string,
    public readonly recipient: string,
    public readonly rejectedBy: string[],
  ) {
    super(
      `PQSafe: payment ${requestId} ($${amount} ${currency} → ${recipient}) ` +
      `was rejected by: [${rejectedBy.join(', ')}]`,
    )
    this.name = 'ApprovalRejectedError'
  }
}

export class ApprovalTimeoutError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly timeoutSec: number,
  ) {
    super(`PQSafe: payment approval ${requestId} timed out after ${timeoutSec}s`)
    this.name = 'ApprovalTimeoutError'
  }
}

// ---------------------------------------------------------------------------
// Internal state (in-memory; real impl would use Redis / KV)
// ---------------------------------------------------------------------------

interface PendingApproval {
  requestId: string
  resolve: (decision: { approved: boolean; approverIdentifier: string }) => void
  createdAt: number
}

const pendingApprovals = new Map<string, PendingApproval>()

// ---------------------------------------------------------------------------
// Canonical request ID
// ---------------------------------------------------------------------------

function computeRequestId(req: ApprovalRequest): string {
  const canonical = JSON.stringify({
    envelopeJson: req.envelope.envelopeJson,
    recipient: req.paymentRequest.recipient,
    amount: req.paymentRequest.amount,
    memo: req.paymentRequest.memo ?? '',
    humanReadableSummary: req.humanReadableSummary,
    ts: Math.floor(Date.now() / 1000),
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32)
}

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

function makeAuditEntry(
  requestId: string,
  approverIdentifier: string,
  channel: ApprovalChannel['name'],
  startMs: number,
  decision: ApprovalAuditEntry['decision'],
  meta?: string,
): ApprovalAuditEntry {
  return {
    approvalRequestId: requestId,
    approverIdentifier,
    channel,
    timestamp: Date.now(),
    decision,
    responseTimeMs: Date.now() - startMs,
    meta,
  }
}

// ---------------------------------------------------------------------------
// Telegram channel
// ---------------------------------------------------------------------------

interface TelegramUpdate {
  update_id: number
  callback_query?: {
    id: string
    data: string
    from: { id: number; username?: string; first_name?: string }
    message: { message_id: number; chat: { id: number } }
  }
}

async function telegramApiCall(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json() as { ok: boolean; result?: unknown; description?: string }
  if (!data.ok) {
    throw new Error(`Telegram API ${method} error: ${data.description ?? JSON.stringify(data)}`)
  }
  return data.result
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}

async function sendTelegramApprovalMessage(
  cfg: TelegramConfig,
  requestId: string,
  req: ApprovalRequest,
  envelope: ReturnType<typeof verifyEnvelope>,
): Promise<void> {
  const riskEmoji = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' }[req.riskScore ?? 'medium'] ?? '🟡'
  const expiryStr = new Date(envelope.validUntil * 1000).toLocaleString('en-HK', {
    timeZone: 'Asia/Hong_Kong',
    dateStyle: 'short',
    timeStyle: 'short',
  })

  const text =
    `🤖 *PQSafe Payment Approval Required*\n\n` +
    `${riskEmoji} *Risk:* ${req.riskScore ?? 'medium'}\n` +
    `*Summary:* ${escapeMarkdown(req.humanReadableSummary)}\n\n` +
    `*Amount:* $${req.paymentRequest.amount} ${envelope.currency}\n` +
    `*Recipient:* ${escapeMarkdown(req.paymentRequest.recipient)}\n` +
    `*Memo:* ${escapeMarkdown(req.paymentRequest.memo ?? '—')}\n` +
    `*Agent:* ${escapeMarkdown(envelope.agent)}\n` +
    `*Envelope expires:* ${escapeMarkdown(expiryStr)} HKT\n` +
    `*Request ID:* \`${requestId}\``

  await telegramApiCall(cfg.botToken, 'sendMessage', {
    chat_id: cfg.chatId,
    text,
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ APPROVE', callback_data: `pqapprove:${requestId}` },
        { text: '❌ REJECT', callback_data: `pqreject:${requestId}` },
      ]],
    },
  })
}

async function pollTelegramForDecision(
  cfg: TelegramConfig,
  requestId: string,
  deadlineMs: number,
): Promise<{ approved: boolean; approverIdentifier: string }> {
  let offset = 0
  while (Date.now() < deadlineMs) {
    const remainingSec = Math.floor((deadlineMs - Date.now()) / 1000)
    const pollTimeout = Math.min(29, Math.max(1, remainingSec))

    let updates: TelegramUpdate[]
    try {
      updates = await telegramApiCall(cfg.botToken, 'getUpdates', {
        offset,
        timeout: pollTimeout,
        allowed_updates: ['callback_query'],
      }) as TelegramUpdate[]
    } catch {
      // Network hiccup — back off briefly and retry
      await new Promise(r => setTimeout(r, 1000))
      continue
    }

    for (const update of updates) {
      offset = update.update_id + 1
      const cq = update.callback_query
      if (!cq) continue

      // Acknowledge button press
      try {
        await telegramApiCall(cfg.botToken, 'answerCallbackQuery', { callback_query_id: cq.id })
      } catch { /* best-effort */ }

      const approverIdentifier = String(
        cq.from.username ? `@${cq.from.username}` : cq.from.id,
      )

      if (cq.data === `pqapprove:${requestId}`) {
        try {
          await telegramApiCall(cfg.botToken, 'editMessageReplyMarkup', {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            reply_markup: { inline_keyboard: [] },
          })
          await telegramApiCall(cfg.botToken, 'sendMessage', {
            chat_id: cq.message.chat.id,
            text: `✅ Approved by ${approverIdentifier} — executing payment ${requestId}`,
          })
        } catch { /* best-effort */ }
        return { approved: true, approverIdentifier }
      }

      if (cq.data === `pqreject:${requestId}`) {
        try {
          await telegramApiCall(cfg.botToken, 'editMessageReplyMarkup', {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            reply_markup: { inline_keyboard: [] },
          })
          await telegramApiCall(cfg.botToken, 'sendMessage', {
            chat_id: cq.message.chat.id,
            text: `❌ Rejected by ${approverIdentifier} — payment ${requestId} cancelled`,
          })
        } catch { /* best-effort */ }
        return { approved: false, approverIdentifier }
      }
    }
  }

  throw new Error('__timeout__')
}

// ---------------------------------------------------------------------------
// Slack channel (Block Kit)
// ---------------------------------------------------------------------------

async function sendSlackApprovalMessage(
  cfg: SlackConfig,
  requestId: string,
  req: ApprovalRequest,
  envelope: ReturnType<typeof verifyEnvelope>,
): Promise<void> {
  const riskEmoji = { low: ':large_green_circle:', medium: ':large_yellow_circle:', high: ':large_orange_circle:', critical: ':red_circle:' }[req.riskScore ?? 'medium'] ?? ':large_yellow_circle:'

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🤖 PQSafe Payment Approval Required', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Summary:*\n${req.humanReadableSummary}` },
        { type: 'mrkdwn', text: `*Risk:* ${riskEmoji} ${req.riskScore ?? 'medium'}` },
        { type: 'mrkdwn', text: `*Amount:*\n$${req.paymentRequest.amount} ${envelope.currency}` },
        { type: 'mrkdwn', text: `*Recipient:*\n${req.paymentRequest.recipient}` },
        { type: 'mrkdwn', text: `*Agent:*\n${envelope.agent}` },
        { type: 'mrkdwn', text: `*Request ID:*\n\`${requestId}\`` },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ Approve', emoji: true },
          style: 'primary',
          value: `approve:${requestId}`,
          action_id: `pqsafe_approve_${requestId}`,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '❌ Reject', emoji: true },
          style: 'danger',
          value: `reject:${requestId}`,
          action_id: `pqsafe_reject_${requestId}`,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `This request will auto-expire in ${req.timeoutSec ?? 600}s. Use the PQSafe SDK \`getApprovalStatus("${requestId}")\` to check status.`,
        },
      ],
    },
  ]

  const body: Record<string, unknown> = { blocks }
  if (cfg.channel) body.channel = cfg.channel

  const res = await fetch(cfg.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`Slack webhook error ${res.status}: ${await res.text()}`)
  }
}

/**
 * Slack approval via webhook does not support interactive callbacks without
 * Slack App configuration (OAuth, event subscriptions). The webhook-only path
 * registers a pending approval and waits for the caller to invoke
 * `resolveApproval(requestId, ...)` out-of-band (e.g. via a Slack App action
 * handler in the developer's own backend).
 */
async function waitForSlackDecision(
  requestId: string,
  deadlineMs: number,
): Promise<{ approved: boolean; approverIdentifier: string }> {
  return new Promise((resolve, reject) => {
    pendingApprovals.set(requestId, {
      requestId,
      resolve,
      createdAt: Date.now(),
    })

    const timer = setTimeout(() => {
      pendingApprovals.delete(requestId)
      reject(new Error('__timeout__'))
    }, deadlineMs - Date.now())

    // Clean up timer if resolved early
    const wrapped = resolve
    pendingApprovals.get(requestId)!.resolve = (decision) => {
      clearTimeout(timer)
      pendingApprovals.delete(requestId)
      wrapped(decision)
    }
  })
}

// ---------------------------------------------------------------------------
// Webhook channel (HMAC-signed)
// ---------------------------------------------------------------------------

async function sendWebhookApprovalRequest(
  cfg: WebhookConfig,
  requestId: string,
  req: ApprovalRequest,
  envelope: ReturnType<typeof verifyEnvelope>,
): Promise<{ approved: boolean; approverIdentifier: string }> {
  const payload = JSON.stringify({
    requestId,
    humanReadableSummary: req.humanReadableSummary,
    amount: req.paymentRequest.amount,
    currency: envelope.currency,
    recipient: req.paymentRequest.recipient,
    memo: req.paymentRequest.memo,
    agent: envelope.agent,
    riskScore: req.riskScore ?? 'medium',
    timeoutSec: req.timeoutSec ?? 600,
    issuedAt: Date.now(),
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'pqsafe-agent-pay/1.0',
    'X-PQSafe-Request-ID': requestId,
  }

  if (cfg.secret) {
    const sig = createHmac('sha256', cfg.secret).update(payload).digest('hex')
    headers['X-PQSafe-Signature'] = sig
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 30_000)

  let res: Response
  try {
    res = await fetch(cfg.url, { method: 'POST', headers, body: payload, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    throw new Error(`Webhook ${cfg.url} responded with ${res.status}`)
  }

  const data = await res.json() as {
    approved: boolean
    approverIdentifier?: string
    signature?: string
  }

  // Validate response signature if secret is set
  if (cfg.secret && data.signature) {
    const expectedSig = createHmac('sha256', cfg.secret)
      .update(JSON.stringify({ requestId, approved: data.approved }))
      .digest()
    const actualSig = Buffer.from(data.signature, 'hex')
    if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
      throw new Error(`Webhook response HMAC validation failed for request ${requestId}`)
    }
  }

  return {
    approved: Boolean(data.approved),
    approverIdentifier: data.approverIdentifier ?? cfg.url,
  }
}

// ---------------------------------------------------------------------------
// Email channel (stub — Sprint 4)
// ---------------------------------------------------------------------------

async function sendEmailApprovalRequest(
  cfg: EmailConfig,
  requestId: string,
  req: ApprovalRequest,
): Promise<{ approved: boolean; approverIdentifier: string }> {
  console.warn(
    `[PQSafe] Email approval channel is STUBBED — request ${requestId} auto-approved for demo.\n` +
    `Set PQSAFE_SMTP_* env vars and implement Sprint 4 email transport to enable real email approvals.\n` +
    `Would have sent to: ${cfg.to}`,
  )
  // Auto-approve in stub mode — callers should not use email channel in production yet
  return { approved: true, approverIdentifier: `stub:${cfg.to}` }
}

// ---------------------------------------------------------------------------
// Discord channel (stub — deferred)
// ---------------------------------------------------------------------------

async function sendDiscordApprovalRequest(
  cfg: DiscordConfig,
  requestId: string,
): Promise<{ approved: boolean; approverIdentifier: string }> {
  // Send a basic message — interactive buttons require Discord App (deferred)
  try {
    await fetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `**PQSafe Payment Approval Required** — Request ID: \`${requestId}\`\nInteractive approval via Discord is deferred — please use Telegram or webhook channel for now.`,
      }),
    })
  } catch { /* best-effort */ }
  console.warn(`[PQSafe] Discord approval channel is STUBBED — request ${requestId} will timeout.`)
  return new Promise((_, reject) => setTimeout(() => reject(new Error('__timeout__')), 60_000))
}

// ---------------------------------------------------------------------------
// SMS / WhatsApp stubs (deferred)
// ---------------------------------------------------------------------------

async function sendSmsApprovalRequest(
  cfg: SmsConfig,
  requestId: string,
): Promise<{ approved: boolean; approverIdentifier: string }> {
  console.warn(`[PQSafe] SMS approval channel is STUBBED — request ${requestId}. Configure Twilio in Sprint 5.`)
  return new Promise((_, reject) => setTimeout(() => reject(new Error('__timeout__')), 1000))
}

async function sendWhatsappApprovalRequest(
  cfg: WhatsappConfig,
  requestId: string,
): Promise<{ approved: boolean; approverIdentifier: string }> {
  console.warn(`[PQSafe] WhatsApp approval channel is STUBBED — request ${requestId}. Configure WhatsApp Business API in Sprint 5.`)
  return new Promise((_, reject) => setTimeout(() => reject(new Error('__timeout__')), 1000))
}

// ---------------------------------------------------------------------------
// Per-channel dispatcher
// ---------------------------------------------------------------------------

async function dispatchChannel(
  channel: ApprovalChannel,
  requestId: string,
  req: ApprovalRequest,
  envelope: ReturnType<typeof verifyEnvelope>,
  deadlineMs: number,
): Promise<{ approved: boolean; approverIdentifier: string }> {
  switch (channel.name) {
    case 'telegram': {
      const cfg = channel.config as TelegramConfig
      if (!cfg.botToken || cfg.botToken === '__mock__') {
        // Mock mode — return approved immediately for tests/dev
        return { approved: true, approverIdentifier: 'mock:telegram' }
      }
      await sendTelegramApprovalMessage(cfg, requestId, req, envelope)
      return pollTelegramForDecision(cfg, requestId, deadlineMs)
    }
    case 'slack': {
      const cfg = channel.config as SlackConfig
      await sendSlackApprovalMessage(cfg, requestId, req, envelope)
      return waitForSlackDecision(requestId, deadlineMs)
    }
    case 'webhook': {
      const cfg = channel.config as WebhookConfig
      return sendWebhookApprovalRequest(cfg, requestId, req, envelope)
    }
    case 'email': {
      const cfg = channel.config as EmailConfig
      return sendEmailApprovalRequest(cfg, requestId, req)
    }
    case 'discord': {
      const cfg = channel.config as DiscordConfig
      return sendDiscordApprovalRequest(cfg, requestId)
    }
    case 'sms': {
      const cfg = channel.config as SmsConfig
      return sendSmsApprovalRequest(cfg, requestId)
    }
    case 'whatsapp': {
      const cfg = channel.config as WhatsappConfig
      return sendWhatsappApprovalRequest(cfg, requestId)
    }
    default:
      throw new Error(`PQSafe: unknown approval channel "${(channel as ApprovalChannel).name}"`)
  }
}

// ---------------------------------------------------------------------------
// In-memory approval status store
// ---------------------------------------------------------------------------

const approvalStore = new Map<string, ApprovalResult>()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Request human approval for a payment across one or more channels.
 * Sends all channels in parallel; first valid response wins (or quorum if threshold > 1).
 *
 * @throws {ApprovalRejectedError} if threshold approvals are not met (more rejections than can be overcome)
 * @throws {ApprovalTimeoutError} if no response within timeoutSec
 */
export async function requestApproval(req: ApprovalRequest): Promise<ApprovalResult> {
  const threshold = req.threshold ?? 1
  const timeoutSec = req.timeoutSec ?? 600
  const deadlineMs = Date.now() + timeoutSec * 1000
  const requestId = computeRequestId(req)
  const startMs = Date.now()

  const envelope = verifyEnvelope(req.envelope)

  const auditLog: ApprovalAuditEntry[] = []
  const approvedBy: string[] = []
  const rejectedBy: string[] = []

  // Race all channels in parallel; collect decisions as they arrive
  const channelPromises = req.approvers.map(async (channel) => {
    const channelStart = Date.now()
    try {
      const decision = await dispatchChannel(channel, requestId, req, envelope, deadlineMs)
      return { channel: channel.name, decision, channelStart }
    } catch (err) {
      const msg = String(err)
      return {
        channel: channel.name,
        decision: { approved: false, approverIdentifier: `error:${channel.name}` },
        channelStart,
        error: msg,
      }
    }
  })

  // We need to track quorum dynamically as each channel resolves
  let result: ApprovalResult | null = null

  await Promise.all(
    channelPromises.map(async (p) => {
      const { channel, decision, channelStart, error } = await p as Awaited<typeof channelPromises[number]> & { error?: string }

      const isTimeout = error?.includes('__timeout__') ?? false
      const decisionStr: ApprovalAuditEntry['decision'] = isTimeout
        ? 'expired'
        : error
          ? 'error'
          : decision.approved
            ? 'approved'
            : 'rejected'

      auditLog.push(makeAuditEntry(
        requestId,
        decision.approverIdentifier,
        channel as ApprovalChannel['name'],
        channelStart,
        decisionStr,
        error,
      ))

      if (decisionStr === 'approved') {
        approvedBy.push(decision.approverIdentifier)
      } else if (decisionStr === 'rejected') {
        rejectedBy.push(decision.approverIdentifier)
      }
      // 'error' and 'expired' channels are counted as exhausted (cannot approve)
    }),
  )

  const now = Date.now()
  const isExpired = now >= deadlineMs
  const approvalCount = approvedBy.length
  const totalChannels = req.approvers.length
  // Channels with errors or timeouts are no longer capable of providing approvals
  const errorCount = auditLog.filter(e => e.decision === 'error' || e.decision === 'expired').length
  const exhaustedChannels = rejectedBy.length + errorCount
  const remainingPossibleApprovals = totalChannels - approvedBy.length - exhaustedChannels

  // Determine final status
  if (approvalCount >= threshold) {
    result = {
      status: 'approved',
      approvedBy,
      rejectedBy,
      approvedAt: now,
      auditLog,
    }
  } else if (rejectedBy.length > 0 && rejectedBy.length > totalChannels - threshold && errorCount === 0) {
    // Pure rejections (no errors) and cannot possibly reach quorum — definitively rejected
    result = {
      status: 'rejected',
      approvedBy,
      rejectedBy,
      approvedAt: 0,
      auditLog,
    }
  } else if (isExpired || remainingPossibleApprovals <= 0) {
    // Timed out, or all remaining channels errored/expired → treat as expired
    result = {
      status: 'expired',
      approvedBy,
      rejectedBy,
      approvedAt: 0,
      auditLog,
    }
  } else {
    result = {
      status: 'pending',
      approvedBy,
      rejectedBy,
      approvedAt: 0,
      auditLog,
    }
  }

  approvalStore.set(requestId, result)

  if (result.status === 'rejected') {
    throw new ApprovalRejectedError(
      requestId,
      req.paymentRequest.amount,
      envelope.currency,
      req.paymentRequest.recipient,
      rejectedBy,
    )
  }

  if (result.status === 'expired') {
    throw new ApprovalTimeoutError(requestId, timeoutSec)
  }

  return result
}

/**
 * Retrieve the current status of an approval request.
 * Returns 'pending' result if not found (may have been GC'd from in-memory store).
 */
export async function getApprovalStatus(id: string): Promise<ApprovalResult> {
  return approvalStore.get(id) ?? {
    status: 'pending',
    approvedBy: [],
    rejectedBy: [],
    approvedAt: 0,
    auditLog: [],
  }
}

/**
 * Programmatically resolve a pending approval (used by Slack App action handlers
 * and webhook receivers to deliver the decision back to the SDK).
 *
 * @param requestId - The approval request ID
 * @param approved - true = approved, false = rejected
 * @param approverIdentifier - Identifier of the approver (e.g. "user@example.com")
 * @returns true if the request was found and resolved; false if already resolved or not found
 */
export function resolveApproval(
  requestId: string,
  approved: boolean,
  approverIdentifier: string,
): boolean {
  const pending = pendingApprovals.get(requestId)
  if (!pending) return false
  pending.resolve({ approved, approverIdentifier })
  return true
}

// ---------------------------------------------------------------------------
// Legacy ApprovalConfig (backward-compatible convenience API)
// ---------------------------------------------------------------------------

export interface ApprovalConfig {
  /** Telegram bot token from @BotFather */
  telegramBotToken?: string
  /** Chat ID to send approval requests to (personal DM, group, or channel) */
  telegramChatId?: string
  /** Payments ≤ this amount execute without approval. Default: Infinity (all autonomous) */
  autoApproveThreshold?: number
  /** Seconds to wait for approval before rejecting. Default: 300 (5 min) */
  timeoutSeconds?: number
  /** Called when approval is sent — useful for logging/telemetry */
  onApprovalSent?: (info: ApprovalInfo) => void
  /** Called when operator approves or rejects */
  onApprovalResult?: (info: ApprovalInfo, approved: boolean) => void
}

export interface ApprovalInfo {
  requestId: string
  agent: string
  issuer: string
  amount: number
  currency: string
  recipient: string
  memo?: string
  envelopeValidUntil: string
  sentAt: string
}

function readEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key] as string
  }
  return undefined
}

function getApprovalConfig(): Required<Omit<ApprovalConfig, 'onApprovalSent' | 'onApprovalResult'>> {
  return {
    telegramBotToken: readEnv('TELEGRAM_BOT_TOKEN') ?? '',
    telegramChatId: readEnv('TELEGRAM_CHAT_ID') ?? '',
    autoApproveThreshold: parseFloat(readEnv('PQSAFE_APPROVAL_THRESHOLD') ?? 'Infinity'),
    timeoutSeconds: parseInt(readEnv('PQSAFE_APPROVAL_TIMEOUT_S') ?? '300', 10),
  }
}

/**
 * Execute a payment with optional human-in-the-loop approval gate.
 * Legacy convenience wrapper — prefer `requestApproval` + `executeAgentPayment` for new code.
 *
 * - amount ≤ autoApproveThreshold → executes immediately (no approval gate)
 * - amount > autoApproveThreshold → approval gate via configured channels
 *
 * @throws {ApprovalRejectedError} if approval is rejected
 * @throws {ApprovalTimeoutError} if approval times out
 * @throws if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set when required
 */
export async function executeWithApproval(
  signed: SignedEnvelope,
  request: PaymentRequest,
  config?: ApprovalConfig,
): Promise<PaymentResult> {
  const cfg = { ...getApprovalConfig(), ...config }
  const envelope = verifyEnvelope(signed)

  // Below threshold → fully autonomous, no approval needed
  if (request.amount <= cfg.autoApproveThreshold) {
    return executeAgentPayment(signed, request)
  }

  // Above threshold → require human approval
  if (!cfg.telegramBotToken || !cfg.telegramChatId) {
    throw new Error(
      `PQSafe: payment amount $${request.amount} exceeds autoApproveThreshold ` +
      `($${cfg.autoApproveThreshold}) but TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID ` +
      `are not set. Either lower the amount, raise the threshold, or set the Telegram vars.`,
    )
  }

  const requestId = `pq-${envelope.nonce.slice(0, 8)}-${Date.now().toString(36)}`
  const info: ApprovalInfo = {
    requestId,
    agent: envelope.agent,
    issuer: envelope.issuer,
    amount: request.amount,
    currency: envelope.currency,
    recipient: request.recipient,
    memo: request.memo,
    envelopeValidUntil: new Date(envelope.validUntil * 1000).toISOString(),
    sentAt: new Date().toISOString(),
  }

  config?.onApprovalSent?.(info)

  // Use the new multi-channel API internally
  const approvalReq: ApprovalRequest = {
    envelope: signed,
    paymentRequest: request,
    approvers: [{
      name: 'telegram',
      config: { botToken: cfg.telegramBotToken, chatId: cfg.telegramChatId },
    }],
    threshold: 1,
    timeoutSec: cfg.timeoutSeconds,
    humanReadableSummary: `Pay $${request.amount} ${envelope.currency} to ${request.recipient}${request.memo ? ` — ${request.memo}` : ''}`,
    riskScore: request.amount >= 1000 ? 'high' : request.amount >= 100 ? 'medium' : 'low',
  }

  let approved = false
  try {
    await requestApproval(approvalReq)
    approved = true
  } catch (err) {
    if (err instanceof ApprovalRejectedError || err instanceof ApprovalTimeoutError) {
      config?.onApprovalResult?.(info, false)
      throw err
    }
    throw err
  }

  config?.onApprovalResult?.(info, approved)
  return executeAgentPayment(signed, request)
}

/**
 * Get your Telegram chat ID by messaging your bot and calling this.
 * Run: TELEGRAM_BOT_TOKEN=... node -e "require('./dist/approval.js').getTelegramChatId().then(console.log)"
 */
export async function getTelegramChatId(): Promise<number | null> {
  const token = readEnv('TELEGRAM_BOT_TOKEN')
  if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN first')

  const updates = await telegramApiCall(token, 'getUpdates', {
    limit: 1,
    allowed_updates: ['message'],
  }) as Array<{ message?: { chat: { id: number } } }>

  if (!updates.length) {
    console.log('No messages yet — send a message to your bot first, then run this again.')
    return null
  }

  return updates[0].message?.chat.id ?? null
}
