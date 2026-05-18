ALTER TABLE branding_settings
ADD COLUMN IF NOT EXISTS background_base64 TEXT;

UPDATE branding_settings
SET background_base64 = background_url
WHERE background_base64 IS NULL
  AND background_url IS NOT NULL;

ALTER TABLE branding_settings
DROP COLUMN IF EXISTS background_url;
