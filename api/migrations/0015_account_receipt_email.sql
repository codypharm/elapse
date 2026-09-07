-- FR-API-123 (amended 2026-09-07): one receipt email per subscription per 10 minutes.
ALTER TABLE subscriptions ADD COLUMN receipt_emailed_at timestamptz;
-- FR-API-121: the account page looks subscriptions up by the subscriber's wallet across merchants.
CREATE INDEX IF NOT EXISTS customers_wallet_address_idx ON customers (wallet_address);
