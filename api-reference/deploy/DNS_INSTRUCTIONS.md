# DNS Instructions — api.pqsafe.xyz (Namecheap)

## Step 1: Deploy and get Fly.io target

After running `bash deploy/deploy.sh`, get your Fly.io app hostname:

```bash
fly ips list --app pqsafe-api
```

The output will show an IPv4 and IPv6 address, e.g.:
```
VERSION  IP                      TYPE              REGION  CREATED AT
v4       66.241.125.XXX          shared            sin     2024-XX-XX
v6       2a09:8280:1::XXXX:XXXX  public (anycast)  sin     2024-XX-XX
```

Fly.io also provides a stable hostname: `pqsafe-api.fly.dev`

## Step 2: Add CNAME in Namecheap

Log in to Namecheap → Domain List → pqsafe.xyz → Manage → Advanced DNS

Add the following record:

| Type  | Host | Value                   | TTL        |
|-------|------|-------------------------|------------|
| CNAME | api  | pqsafe-api.fly.dev.     | Automatic  |

**Important:** Use the `.fly.dev` CNAME (not the raw IP) so Fly.io can handle TLS certificate routing correctly.

If Namecheap doesn't allow CNAME on the apex (`@`), use an `A` record with the shared IPv4 for the root domain (not needed here — `api` is a subdomain so CNAME is fine).

## Step 3: Register TLS certificate with Fly

```bash
fly certs add api.pqsafe.xyz --app pqsafe-api
```

This triggers Let's Encrypt certificate issuance. Takes 1-3 minutes.

## Step 4: Verify

```bash
# Check certificate status
fly certs check api.pqsafe.xyz --app pqsafe-api

# Test DNS resolution
dig api.pqsafe.xyz CNAME

# Test HTTPS
curl https://api.pqsafe.xyz/health
# Expected: {"status":"ok"}

curl https://api.pqsafe.xyz/version
# Expected: {"version":"0.1.0","crypto_backend":"...","mock_mode":"false","airwallex_mode":"prod"}
```

## Troubleshooting

- **Certificate pending**: DNS propagation can take 5-30 minutes. Run `fly certs check` repeatedly.
- **Too many redirects**: Ensure Namecheap doesn't have an HTTP redirect on `api` — it should be a pure CNAME.
- **502 Bad Gateway**: App is still starting. Check `fly logs --app pqsafe-api`.
- **Auth errors on /docs**: The `/docs` and `/health` endpoints are unauthenticated. Write endpoints require `Authorization: Bearer <PQSAFE_API_KEY>`.

## Full DNS record summary for pqsafe.xyz

| Type  | Host    | Value                      | Purpose                   |
|-------|---------|----------------------------|---------------------------|
| CNAME | api     | pqsafe-api.fly.dev.        | REST API (Fly.io)         |
| CNAME | mcp     | pqsafe-mcp.workers.dev.    | MCP server (CF Worker)    |
| CNAME | demo    | pqsafe-demo.pages.dev.     | Live demo (CF Pages)      |
| CNAME | ledger  | pqsafe-ledger.workers.dev. | Ledger API (CF Worker)    |
