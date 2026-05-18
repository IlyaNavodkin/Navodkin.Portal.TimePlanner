ALTER TABLE branding_settings
  DROP COLUMN IF EXISTS logo_alt,
  DROP COLUMN IF EXISTS admin_panel_label,
  DROP COLUMN IF EXISTS auth_sign_in_label;
