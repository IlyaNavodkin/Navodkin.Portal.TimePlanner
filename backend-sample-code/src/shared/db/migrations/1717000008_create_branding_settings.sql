CREATE TABLE IF NOT EXISTS branding_settings (
  id                   INTEGER PRIMARY KEY,
  app_name             TEXT NOT NULL DEFAULT 'Koster',
  html_title           TEXT NOT NULL DEFAULT 'Koster - Online Video Chat',
  tagline              TEXT NOT NULL DEFAULT 'Fast. Secure. No downloads needed.',
  logo_alt             TEXT NOT NULL DEFAULT 'Koster logo',
  admin_panel_label    TEXT NOT NULL DEFAULT 'Admin Panel',
  auth_sign_in_label   TEXT NOT NULL DEFAULT 'Sign In',
  logo_url             TEXT NOT NULL DEFAULT '/logo/logo-invisible.svg',
  favicon_url          TEXT NOT NULL DEFAULT '/logo/logo-flat.svg',
  banner_url           TEXT,
  theme_colors         JSONB NOT NULL DEFAULT '{
    "brand":"#894040",
    "bgBase":"#1e1f22",
    "bgFloat":"#232428",
    "bgElevated":"#2b2d31",
    "bgModifier":"#3f4147",
    "textPrimary":"#ffffff",
    "textBody":"#dcddde",
    "textSecondary":"#b5bac1",
    "textMuted":"#6d6f78"
  }'::jsonb,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO branding_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
