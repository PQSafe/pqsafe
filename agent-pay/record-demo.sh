#!/bin/bash
# PQSafe AgentPay — Video Recording Helper
# Run this on recording day. It clears terminal, sets up env, runs demo.
# Usage: bash record-demo.sh

set -euo pipefail

# Check env vars
if [ ! -f ~/.pqsafe-awx.env ]; then
  echo "ERROR: ~/.pqsafe-awx.env not found. Source your Airwallex sandbox credentials first."
  exit 1
fi

set -a
source ~/.pqsafe-awx.env
set +a

if [ -z "${AIRWALLEX_CLIENT_ID:-}" ] || [ -z "${AIRWALLEX_API_KEY:-}" ]; then
  echo "ERROR: AIRWALLEX_CLIENT_ID or AIRWALLEX_API_KEY not set."
  exit 1
fi

clear
echo ""
echo "  Ready to record. Press ENTER when QuickTime is rolling."
read -r

npm run demo
