ALTER TABLE oidc_settings
  ADD COLUMN IF NOT EXISTS username_claim TEXT NOT NULL DEFAULT 'preferred_username',
  ADD COLUMN IF NOT EXISTS avatar_claim   TEXT NOT NULL DEFAULT 'picture';
