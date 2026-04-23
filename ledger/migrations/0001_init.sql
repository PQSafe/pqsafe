-- PQSafe AgentPay Ledger — D1 Schema
-- Migration: 0001_init

CREATE TABLE IF NOT EXISTS transfers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  envelope_hash TEXT    NOT NULL UNIQUE,          -- SHA-256 of signed envelope (hex, anonymized key)
  agent_id_hash TEXT    NOT NULL,                 -- SHA-256 of agent identifier (anonymized)
  rail          TEXT    NOT NULL CHECK (rail IN ('airwallex','wise','stripe','usdc-base','x402')),
  amount_bucket TEXT    NOT NULL CHECK (amount_bucket IN ('<10','10-100','100-1000','1000-10000','>10000')),
  currency      TEXT    NOT NULL,                 -- ISO 4217
  outcome       TEXT    NOT NULL CHECK (outcome IN ('success','failed','rejected','pending')),
  created_at    INTEGER NOT NULL                  -- Unix timestamp (seconds)
);

CREATE INDEX IF NOT EXISTS idx_transfers_created_at   ON transfers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_agent_id_hash ON transfers (agent_id_hash);
CREATE INDEX IF NOT EXISTS idx_transfers_outcome       ON transfers (outcome);

-- Seed data: 10 anonymized fake transfers
INSERT INTO transfers (envelope_hash, agent_id_hash, rail, amount_bucket, currency, outcome, created_at) VALUES
  ('a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef', 'hash_agent_001', 'airwallex',  '100-1000',    'USD', 'success',  1745000000),
  ('b2c3d4e5f6071829a3b4c5d6e7f8091a2345678901bcdef01234567890abcdef1', 'hash_agent_002', 'stripe',     '10-100',      'USD', 'success',  1744990000),
  ('c3d4e5f607182930b4c5d6e7f8091a2b345678902cdef012345678901bcdef01', 'hash_agent_001', 'usdc-base',  '1000-10000',  'USD', 'success',  1744980000),
  ('d4e5f6071829304ac5d6e7f8091a2b3c45678903def0123456789012cdef012', 'hash_agent_003', 'wise',       '<10',         'GBP', 'success',  1744970000),
  ('e5f607182930405bd6e7f8091a2b3c4d5678904ef01234567890123def0123', 'hash_agent_004', 'airwallex',  '10-100',      'HKD', 'failed',   1744960000),
  ('f607182930405162e7f8091a2b3c4d5e678905f012345678901234ef01234', 'hash_agent_002', 'x402',       '100-1000',    'USD', 'success',  1744950000),
  ('071829304051627380091a2b3c4d5e6f78906012345678901234567801234', 'hash_agent_005', 'stripe',     '>10000',      'USD', 'success',  1744940000),
  ('182930405162738491a2b3c4d5e6f7081234567890123456789012345678', 'hash_agent_003', 'airwallex',  '1000-10000',  'EUR', 'rejected', 1744930000),
  ('29304051627384950a2b3c4d5e6f708192345678901234567890123456789', 'hash_agent_001', 'wise',       '10-100',      'SGD', 'success',  1744920000),
  ('3040516273849506b3c4d5e6f7081920345678901234567890123456789a', 'hash_agent_006', 'usdc-base',  '100-1000',    'USD', 'success',  1744910000);
