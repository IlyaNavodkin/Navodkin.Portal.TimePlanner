-- Migration: add OIDC fields to users table

ALTER TABLE users
  ADD COLUMN oidc_sub      TEXT,
  ADD COLUMN oidc_provider TEXT,
  ADD COLUMN avatar_url    TEXT,
  ADD COLUMN profile_sync  BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX users_oidc_unique ON users (oidc_provider, oidc_sub)
  WHERE oidc_sub IS NOT NULL;
