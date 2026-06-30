#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-https://api.pqsafe.xyz/api/minds/authorize-spend}"

if [[ -z "${PQSAFE_API_KEY:-}" ]]; then
  echo "PQSAFE_API_KEY is required in the environment" >&2
  exit 2
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

post_case() {
  local name="$1"
  local expected="$2"
  local body="$3"
  local out="${tmp_dir}/${name}.json"
  local status

  status="$(
    curl -sS -o "${out}" -w "%{http_code}" \
      -X POST "${API_URL}" \
      -H "Authorization: Bearer ${PQSAFE_API_KEY}" \
      -H "Content-Type: application/json" \
      --data "${body}"
  )"

  if [[ "${status}" != "200" ]]; then
    echo "[FAIL] ${name}: HTTP ${status}" >&2
    cat "${out}" >&2
    exit 1
  fi

  python - "$name" "$expected" "${out}" <<'PY'
import json
import sys

name, expected, path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)

actual = data.get("decision")
allowed = data.get("wallet_action", {}).get("allowed_to_continue")
reason = data.get("reason_code")
backend = data.get("audit", {}).get("crypto_backend")

if actual != expected:
    print(f"[FAIL] {name}: expected decision={expected}, got decision={actual}, reason_code={reason}", file=sys.stderr)
    print(json.dumps(data, indent=2), file=sys.stderr)
    sys.exit(1)

if actual == "approved" and allowed is not True:
    print(f"[FAIL] {name}: approved response did not allow wallet continuation", file=sys.stderr)
    print(json.dumps(data, indent=2), file=sys.stderr)
    sys.exit(1)

if actual != "approved" and allowed is not False:
    print(f"[FAIL] {name}: blocked response allowed wallet continuation", file=sys.stderr)
    print(json.dumps(data, indent=2), file=sys.stderr)
    sys.exit(1)

print(f"[PASS] {name}: decision={actual} reason_code={reason} crypto_backend={backend}")
PY
}

approved='{
  "mind_id": "mind-demo",
  "agent_id": "agent-demo",
  "merchant": "merchant_wallet_001",
  "amount": 25,
  "currency": "USDC",
  "memo": "Build East demo authorization",
  "policy": {
    "whitelist": ["merchant_wallet_001"],
    "single_payment_limit": 100,
    "require_memo": true
  },
  "human_approved": false
}'

blocked_policy='{
  "mind_id": "mind-demo",
  "agent_id": "agent-demo",
  "merchant": "merchant_wallet_002",
  "amount": 25,
  "currency": "USDC",
  "memo": "Build East demo authorization",
  "policy": {
    "whitelist": ["merchant_wallet_001"],
    "single_payment_limit": 100,
    "require_memo": true
  },
  "human_approved": false
}'

blocked_tamper='{
  "mind_id": "mind-demo",
  "agent_id": "agent-demo",
  "merchant": "merchant_wallet_001",
  "amount": 25,
  "currency": "USDC",
  "memo": "Build East demo authorization",
  "policy": {
    "whitelist": ["merchant_wallet_001"],
    "single_payment_limit": 100,
    "require_memo": true
  },
  "human_approved": false,
  "_tamper_amount": 999
}'

needs_human_approval='{
  "mind_id": "mind-demo",
  "agent_id": "agent-demo",
  "merchant": "merchant_wallet_001",
  "amount": 80,
  "currency": "USDC",
  "memo": "Build East demo authorization",
  "policy": {
    "whitelist": ["merchant_wallet_001"],
    "single_payment_limit": 100,
    "require_memo": true
  },
  "human_approved": false
}'

post_case "approved" "approved" "${approved}"
post_case "blocked_policy" "blocked_policy" "${blocked_policy}"
post_case "blocked_tamper" "blocked_tamper" "${blocked_tamper}"
post_case "needs_human_approval" "needs_human_approval" "${needs_human_approval}"

echo "All Minds authorize-spend smoke checks passed against ${API_URL}"
