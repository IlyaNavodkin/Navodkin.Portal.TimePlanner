ALTER TABLE oidc_settings
  DROP COLUMN IF EXISTS username_claim,
  DROP COLUMN IF EXISTS avatar_claim;
