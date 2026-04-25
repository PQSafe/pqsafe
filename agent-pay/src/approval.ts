/**
 * PQSafe AgentPay — Human-in-the-Loop Approval Layer
 *
 * Wraps executeAgentPayment() with an optional approval gate:
 *   - Payments below a threshold: execute immediately (fully autonomous)
 *   - Payments above a threshold: send Telegram notification → wait for
 *     human APPROVE/REJECT before executing
 *
 * This is the enterprise feature that CFOs and compliance teams require:
 * "Agents can spend up to $100 autonomously; anything above requires my 60-second approval."
 *
 * Required env vars (only needed if approval gate is enabled):
 *   TELEGRAM_BOT_TOKEN    — from @BotFather
 *   TELEGRAM_CHAT_ID      — your personal chat ID (or group/channel)
 *   PQSAFE_APPROVAL_THRESHOLD — amount above which human approval is required (default: Infinity)
 *   PQSAFE_APPROVAL_TIMEOUT_S — seconds to wait for approval before auto-reject (default: 300)
 *
 * Usage:
 *   import { executeWithApproval } from '@pqsafe/agent-pay/approval'
 *
 *   const result = await executeWithApproval(signed, {
 *     recipient: 'anthropic.com/billing',
 *     amount: 150,  // above threshold → Telegram message sent
 *     memo: 'API credits',
 *   })
 *
 * The operator sees on Telegram:
 *   🤖 PQSafe Payment Request
 *   Agent: claude-code-agent-v1
 *   Amount: $150 USD
 *   Recipient: anthropic.com/billing
 *   Memo: API credits
 *   Envelope expires: 2026-04-26 15:30 HKT
 *   [APPROVE] [REJECT]
 */

import { executeAgentPayment, verifyEnvelope } from './index.js'
import type { SignedEnvelope, PaymentRequest, PaymentResult } from './types.js'

// ---------------------------------------------------------------------------
// Config
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

// ---------------------------------------------------------------------------
// Telegram helpers
// ---------------------------------------------------------------------------

interface TelegramMessage {
  message_id: number
  chat: { id: number }
  text?: string
}

interface TelegramUpdate {
  update_id: number
  callback_query?: {
    id: string
    data: string
    message: TelegramMessage
  }
  message?: TelegramMessage
}

async function telegramRequest(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json() as { ok: boolean; result?: Record<string, unknown> }
  if (!data.ok) {
    throw new Error(`Telegram API error: ${JSON.stringify(data)}`)
  }
  return data.result ?? {}
}

async function sendApprovalMessage(
  token: string,
  chatId: string,
  info: ApprovalInfo,
): Promise<number> {
  const expiryStr = new Date(info.envelopeValidUntil).toLocaleString('en-HK', {
    timeZone: 'Asia/Hong_Kong',
    dateStyle: 'short',
    timeStyle: 'short',
  })

  const text =
    `🤖 *PQSafe Payment Request*\n\n` +
    `*Agent:* ${escapeMarkdown(info.agent)}\n` +
    `*Amount:* $${info.amount} ${info.currency}\n` +
    `*Recipient:* ${escapeMarkdown(info.recipient)}\n` +
    `*Memo:* ${escapeMarkdown(info.memo ?? '—')}\n` +
    `*Envelope expires:* ${escapeMarkdown(expiryStr)} HKT\n` +
    `*Request ID:* \`${info.requestId}\``

  const result = await telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ APPROVE', callback_data: `approve:${info.requestId}` },
        { text: '❌ REJECT',  callback_data: `reject:${info.requestId}` },
      ]],
    },
  }) as { message_id: number }

  return result.message_id
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}

/** Poll for callback_query matching the request ID */
async function waitForApproval(
  token: string,
  requestId: string,
  timeoutSeconds: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutSeconds * 1000
  let offset = 0

  while (Date.now() < deadline) {
    const updates = await telegramRequest(token, 'getUpdates', {
      offset,
      timeout: Math.min(30, Math.floor((deadline - Date.now()) / 1000)),
      allowed_updates: ['callback_query'],
    }) as unknown as TelegramUpdate[]

    for (const update of updates) {
      offset = update.update_id + 1

      const cq = update.callback_query
      if (!cq) continue

      // Acknowledge the button press
      await telegramRequest(token, 'answerCallbackQuery', { callback_query_id: cq.id })

      if (cq.data === `approve:${requestId}`) {
        await telegramRequest(token, 'editMessageReplyMarkup', {
          chat_id: cq.message.chat.id,
          message_id: cq.message.message_id,
          reply_markup: { inline_keyboard: [] },
        })
        await telegramRequest(token, 'sendMessage', {
          chat_id: cq.message.chat.id,
          text: `✅ Approved — executing payment ${requestId}`,
        })
        return true
      }

      if (cq.data === `reject:${requestId}`) {
        await telegramRequest(token, 'editMessageReplyMarkup', {
          chat_id: cq.message.chat.id,
          message_id: cq.message.message_id,
          reply_markup: { inline_keyboard: [] },
        })
        await telegramRequest(token, 'sendMessage', {
          chat_id: cq.message.chat.id,
          text: `❌ Rejected — payment ${requestId} cancelled`,
        })
        return false
      }
    }
  }

  // Timed out
  return false
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a payment with optional human-in-the-loop approval gate.
 *
 * - amount ≤ autoApproveThreshold → executes immediately
 * - amount > autoApproveThreshold → sends Telegram message, waits for response
 *
 * @throws if approval is rejected or times out
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

  // Above threshold → require human approval via Telegram
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
  await sendApprovalMessage(cfg.telegramBotToken, cfg.telegramChatId, info)

  const approved = await waitForApproval(
    cfg.telegramBotToken,
    requestId,
    cfg.timeoutSeconds,
  )

  config?.onApprovalResult?.(info, approved)

  if (!approved) {
    throw new Error(
      `PQSafe: payment ${requestId} ($${request.amount} ${envelope.currency} → ${request.recipient}) ` +
      `was rejected or timed out after ${cfg.timeoutSeconds}s`,
    )
  }

  return executeAgentPayment(signed, request)
}

/**
 * Get your Telegram chat ID by messaging your bot and calling this.
 * Run: TELEGRAM_BOT_TOKEN=... node -e "require('./dist/approval.js').getTelegramChatId().then(console.log)"
 */
export async function getTelegramChatId(): Promise<number | null> {
  const token = readEnv('TELEGRAM_BOT_TOKEN')
  if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN first')

  const updates = await telegramRequest(token, 'getUpdates', {
    limit: 1,
    allowed_updates: ['message'],
  }) as unknown as TelegramUpdate[]

  if (!updates.length) {
    console.log('No messages yet — send a message to your bot first, then run this again.')
    return null
  }

  return updates[0].message?.chat.id ?? null
}
