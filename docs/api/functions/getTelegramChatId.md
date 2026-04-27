[**PQSafe AgentPay API Reference v0.1.0**](../README.md)

***

[PQSafe AgentPay API Reference](../README.md) / getTelegramChatId

# Function: getTelegramChatId()

> **getTelegramChatId**(): `Promise`\<`number` \| `null`\>

Defined in: [agent-pay/src/approval.ts:964](https://github.com/PQSafe/pqsafe/blob/bf2933a652d25995bb1e6fa114bf69715cac9034/agent-pay/src/approval.ts#L964)

Get your Telegram chat ID by messaging your bot and calling this.
Run: TELEGRAM_BOT_TOKEN=... node -e "require('./dist/approval.js').getTelegramChatId().then(console.log)"

## Returns

`Promise`\<`number` \| `null`\>
