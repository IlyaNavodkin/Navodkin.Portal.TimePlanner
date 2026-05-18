-- Migration: create auth_sessions table for access/refresh lifecycle

CREATE TABLE auth_sessions (
  id           UUID PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_source  TEXT NOT NULL CHECK (auth_source IN ('local', 'oidc')),
  keycloak_sid TEXT,
  keycloak_sub TEXT,
  refresh_hash TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  revoke_reason TEXT
);

CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_sid_active_idx ON auth_sessions (keycloak_sid, revoked_at);
CREATE INDEX auth_sessions_sub_active_idx ON auth_sessions (keycloak_sub, revoked_at);
CREATE INDEX auth_sessions_expires_idx ON auth_sessions (expires_at);
