CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS app_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL,
  scope TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB NULL,
  source TEXT NOT NULL DEFAULT 'frontend',
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  username TEXT NULL,
  trace_id TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_user_created_at ON app_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level_created_at ON app_logs (level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_scope_created_at ON app_logs (scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_message_trgm ON app_logs USING gin (message gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_app_logs_meta_gin ON app_logs USING gin (meta);
