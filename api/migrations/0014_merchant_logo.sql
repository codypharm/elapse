-- FR-API-104: the checkout logo, PNG bytes in Postgres (Undecided 9, decided 2026-09-05),
-- served from GET /v1/dashboard/branding/logo/:merchant_id. `branding->>'logo_url'` carries
-- the public URL with a content-hash query so a replaced logo changes URL.
ALTER TABLE merchants ADD COLUMN logo_png bytea;
