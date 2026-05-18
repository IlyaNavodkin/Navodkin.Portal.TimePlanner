-- init.sql: runs once on first connection to bootstrap migration tracking

CREATE TABLE IF NOT EXISTS migrations (
    filename    VARCHAR(255) PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);