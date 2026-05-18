ALTER TABLE branding_settings
  ADD COLUMN IF NOT EXISTS logo_alt TEXT NOT NULL DEFAULT 'Koster logo',
  ADD COLUMN IF NOT EXISTS admin_panel_label TEXT NOT NULL DEFAULT 'Admin Panel',
  ADD COLUMN IF NOT EXISTS auth_sign_in_label TEXT NOT NULL DEFAULT 'Sign In';
