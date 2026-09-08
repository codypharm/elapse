# Platform fee is 2 percent of each settlement
2026-09-08 · Decided by William and Furqaan · Status: accepted · Supersedes the 1 percent default in [ADR 2026-09-03 settlement fee](./2026-09-03-settlement-fee.md)

## Context
The fee was set at 100 bps on 2026-09-03 as a placeholder default. Measuring the keeper's gas
on 2026-09-08 ([ADR 2026-09-08 keeper cadence](./2026-09-08-keeper-cadence-one-hour.md))
put a number on what each settlement costs the platform: about 0.024 MON per settle. At a
percentage fee the platform only earns more than it spends when the meter accrued at least
`gas ÷ fee rate` in the interval. At 1 percent that is 100× the gas cost per hour; at 2 percent,
50×. For the pitch's products (GPU at $0.004/s, $14.40/hour) both clear easily; for a $1/hour
live stream the 2 percent line holds up to a MON price near $0.80 where 1 percent gives up at
$0.40. Furqaan proposed 2 percent; William agreed. It stays under the Stripe comparison judges
will make (2.9 percent + 30 cents).

## Decision
1. **`feeBps = 200`.** The owner (`elapse-dev`, 0xaf1444…) calls `StreamFactory.setFee(200, treasury)`
   on testnet; the treasury address is unchanged. No redeploy: the fee is a factory parameter
   (FR-CON-006) and clones snapshot it at `create` (contracts Undecided 9), so streams created
   before the call keep 1 percent and every stream after it carries 2 percent.
2. **The deployment record follows the chain.** `contracts/deployments/10143.json` `feeBps`
   becomes 200 and is synced to `api/` and `indexer/`; the API serves `fee_bps` from that
   record (FR-API-103), so the dashboard's Settings and Invoices copy read 2 percent without
   a code change. Docs snippet `Platform fee` row updated.
3. **Per-merchant rates and volume pricing stay out of the MVP**, as in the 2026-09-03 ADR.
   Amount-based settlement (settle when unsettled accrual reaches a minimum) remains the
   mainnet follow-up for meters cheaper than the break-even.

## Consequences
- Existing testnet subscriptions settle at 1 percent until they end. Invoices show the fee
  per row, so mixed rates are visible, not hidden.
- Landing and docs copy never state the number except the contracts snippet table; the
  dashboard reads it from the API (FR-DSH-061/102).
- Mainnet deploy (Week 5) sets 200 in the deploy script's default.
