ALTER TABLE branding_settings
ADD COLUMN IF NOT EXISTS background_base64 TEXT;

UPDATE branding_settings
SET background_base64 = banner_url
WHERE background_base64 IS NULL
  AND banner_url ~ '^data:image/(svg\+xml|png|jpeg|webp);base64,';
