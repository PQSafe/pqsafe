"""
PQSafe API Reference — in-memory store for envelopes and transfers.

WARNING: This is an ephemeral, single-process store.  All data is lost on
restart.  It is intentionally simple so design partners can read the
business logic without ORM noise.

Upgrade path to production persistence:
  - Replace EnvelopeStore / TransferStore with SQLAlchemy + asyncpg (Postgres)
    or aiosqlite (SQLite for single-host deploys).
  - Keep the same interface: get() / put() / exists() so routers need no change.
  - Add a nonce_seen() check backed by a Redis SET with TTL equal to the
    maximum envelope validity window.
"""

from __future__ import annotations

import threading
from typing import Any, Optional


class MemoryStore:
    """Thread-safe in-memory key/value store."""

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}
        self._lock = threading.Lock()

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            self._data[key] = value

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            return self._data.get(key)

    def exists(self, key: str) -> bool:
        with self._lock:
            return key in self._data

    def all_values(self) -> list[Any]:
        with self._lock:
            return list(self._data.values())


# ---------------------------------------------------------------------------
# Singletons — import these in routers
# ---------------------------------------------------------------------------

# Stores unsigned envelopes (after POST /v1/envelopes)
envelope_store = MemoryStore()

# Stores signed & verified envelopes (after POST /v1/envelopes/{id}/sign)
signed_envelope_store = MemoryStore()

# Stores transfer results (after POST /v1/pay)
transfer_store = MemoryStore()

# Tracks used nonces (envelope.nonce → True) to prevent replay attacks
nonce_store = MemoryStore()
