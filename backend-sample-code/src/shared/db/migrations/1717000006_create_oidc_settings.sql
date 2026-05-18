CREATE TABLE IF NOT EXISTS oidc_settings (
  id            INTEGER PRIMARY KEY,
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  provider_name TEXT    NOT NULL DEFAULT '',
  issuer        TEXT    NOT NULL DEFAULT '',
  client_id     TEXT    NOT NULL DEFAULT '',
  client_secret TEXT    NOT NULL DEFAULT '',
  redirect_uri  TEXT    NOT NULL DEFAULT '',
  scope         TEXT    NOT NULL DEFAULT 'openid profile email',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
