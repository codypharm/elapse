-- FR-WRK-074. One row per keeper tick: the relayer's native MON balance, so GET /v1/status
-- (FR-API-075) can report burn and runway without touching the RPC on request.
CREATE TABLE relayer_balance_samples (
  id          bigserial PRIMARY KEY,
  chain_id    integer NOT NULL,
  address     text NOT NULL,
  balance_wei numeric(78,0) NOT NULL,
  sampled_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX relayer_balance_samples_chain_time ON relayer_balance_samples (chain_id, sampled_at DESC);
