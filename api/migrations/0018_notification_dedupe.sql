-- FR-WRK-042 / FR-API-109: expiry notices fire once per (target, threshold) and the first-delivery
-- notice once per mode, whatever the worker restarts. The key is set only by those writers.
ALTER TABLE notifications ADD COLUMN dedupe_key text;
CREATE UNIQUE INDEX notifications_dedupe_idx ON notifications (merchant_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
-- The sweep reads keys and endpoints by expiry; both sets are tiny but the scan should not touch every row.
CREATE INDEX api_keys_expiring_idx ON api_keys (expires_at) WHERE expires_at IS NOT NULL AND revoked_at IS NULL;
CREATE INDEX webhook_endpoints_secret_expiring_idx ON webhook_endpoints (previous_secret_expires_at) WHERE previous_secret_expires_at IS NOT NULL;
