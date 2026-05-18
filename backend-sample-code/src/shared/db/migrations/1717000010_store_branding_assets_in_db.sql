UPDATE branding_settings
SET logo_url = '/logo/logo-invisible.svg'
WHERE logo_url LIKE '/branding-assets/%';

UPDATE branding_settings
SET favicon_url = '/logo/logo-flat.svg'
WHERE favicon_url LIKE '/branding-assets/%';

UPDATE branding_settings
SET banner_url = NULL
WHERE banner_url LIKE '/branding-assets/%';
