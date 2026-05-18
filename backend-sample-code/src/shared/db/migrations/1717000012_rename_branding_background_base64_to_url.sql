ALTER TABLE branding_settings
ADD COLUMN IF NOT EXISTS background_url TEXT;

UPDATE branding_settings
SET background_url = background_base64
WHERE background_url IS NULL
  AND background_base64 IS NOT NULL;

ALTER TABLE branding_settings
DROP COLUMN IF EXISTS background_base64;
