# PQSafe MCP Server

Cloudflare Worker exposing PQSafe AgentPay as MCP tools for Claude Desktop, Cursor, and any other MCP-compatible host.

## Tools

| Tool | Description |
|------|-------------|
| `pqsafe_create_envelope` | Build a SpendEnvelope JSON ready for ML-DSA-65 signing |
| `pqsafe_pay` | Verify a signed envelope and execute a payment via the PQSafe API |
| `pqsafe_check_balance` | Inspect envelope constraints (max amount, expiry, recipients) without making a payment |

## Claude Desktop config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pqsafe": {
      "url": "https://mcp.pqsafe.xyz/mcp"
    }
  }
}
```

Restart Claude Desktop. You will see PQSafe tools in the tool picker.

## Deploy

### Prerequisites

```bash
npm install -g wrangler
wrangler login
```

### First deploy

```bash
cd mcp-server
npm install

# Set the API key secret (must match PQSAFE_API_KEY on the Fly.io API server)
npm run secret:set

# Deploy the Worker
npm run deploy
```

### Custom domain

After deploying, add a CNAME in your DNS (see `api-reference/deploy/DNS_INSTRUCTIONS.md`):

| Type  | Host | Value                   |
|-------|------|-------------------------|
| CNAME | mcp  | pqsafe-mcp.workers.dev. |

Then verify:

```bash
curl https://mcp.pqsafe.xyz/health
# {"status":"ok","service":"pqsafe-mcp","version":"0.1.0"}
```

### Subsequent deploys

```bash
npm run deploy
```

## Usage example

Once connected via Claude Desktop, Claude can:

```
User: Pay $199 to GB29NWBK60161331926819 for the Perplexity Pro subscription.

Claude: I'll use PQSafe to execute this payment.
[calls pqsafe_check_balance → confirms budget available]
[calls pqsafe_pay → returns transferId awx_prod_xxxx, status: COMPLETED]

Payment executed:
  Transfer ID: awx_prod_xxxx
  Amount: $199 USD
  Recipient: GB29NWBK60161331926819
  Status: COMPLETED
```

## Architecture

```
Claude Desktop / Cursor
        |
        | MCP (HTTP POST /mcp)
        v
pqsafe-mcp.pqsafe.xyz  (this Cloudflare Worker)
        |
        | REST (HTTPS POST /v1/pay)
        v
api.pqsafe.xyz  (Fly.io FastAPI — verifies ML-DSA-65, enforces envelope constraints)
        |
        | OAuth2 + REST
        v
Airwallex / Wise / Stripe / USDC-Base
```

## Environment variables

| Variable | Description | Set via |
|----------|-------------|---------|
| `PQSAFE_API_URL` | PQSafe REST API base URL | `wrangler.toml` [vars] |
| `PQSAFE_API_KEY` | Bearer token for write endpoints | `wrangler secret put` |

## Local development

```bash
npm run dev
# Worker runs at http://localhost:8787

# Test locally
curl -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
