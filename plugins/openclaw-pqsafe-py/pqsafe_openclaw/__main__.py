"""
python -m pqsafe_openclaw — OpenClaw TypeScript bridge CLI entry point.

Usage:
    python -m pqsafe_openclaw <action> <json-args>

Example:
    python -m pqsafe_openclaw pay '{"issuer":"pq1aaa...","agent":"coo","recipient":"did:web:vendor.com","amount":25.0,"currency":"HKD"}'
"""

from .skill import _cli_main

if __name__ == "__main__":
    _cli_main()
