-- SafeShare-AI — Cloudflare D1 Serverless Database Schema
-- High performance, zero data-remanence, 100k writes/day free tier.

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  burn_on_read INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares (expires_at);
