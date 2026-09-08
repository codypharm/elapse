# Keeper cadence moves from 5 minutes to 1 hour; amount-based settlement is the mainnet question
2026-09-08 · Decided by William · Status: accepted · Supersedes contracts-frd Undecided 6 (2026-09-05)

## Context
On 2026-09-05 the keeper cadence was set to 5 minutes on the note that "gas is negligible on
Monad". Measured on testnet on 2026-09-08 while checking the relayer balance for an
UptimeRobot alert: gas price 102 gwei, a `settleBatch` settle of one stream 234–252 k gas,
so about **0.024 MON per settle**. At one settle per running stream every 5 minutes that is
288 settles and **about 6.9 MON per running meter per day**. The relayer held 4.64 MON, so a
single meter left running would empty it in about 16 hours and every later checkout would
fail with an opaque error while the status route looked healthy.

Nothing in the product needs a five-minute pull. The subscriber's meter ticks client-side
from `rate × (now − started_at)`; per-subscription escrow already guarantees the merchant is
paid; Stop, Pause at cap, and the cap itself settle immediately. The cadence only decides how
often a long session adds an `invoice.settled` row.

## Decision
1. **`KEEPER_CADENCE_S=3600`** on the hosted worker (Railway) and in local `.env`. The code
   default stays 300 s so the tests and the spec rows keep their numbers; the deployed value
   is the one that matters and is recorded here. Burn per running meter falls to about
   0.58 MON per day; the current balance lasts about eight days per meter.
2. **The relayer balance is monitored.** The status route will report the relayer's balance,
   burn rate and projected runway with a `low` flag (spec to follow, FR-API row), and an
   UptimeRobot keyword monitor on that flag alerts William. Until then William tops the
   relayer up to at least 20 MON before any recording.
3. **Amount-based settlement is parked for after the submission.** Settling on a clock costs
   the same gas whether the interval earned a dollar or a cent, so at mainnet prices a cheap
   API meter would pay more in gas than it earns. The likely shape is "settle when unsettled
   accrual reaches a per-product minimum, with an hourly backstop, and always on stop". That
   changes the keeper's due-selection and the product object, and needs Furqaan's view on
   the contract side. Not before 13 October.

## Consequences
- Dashboard invoice lists for long sessions grow hourly instead of every five minutes.
  The demo (start → stop at 83 s → one invoice) is unchanged.
- `docs/specs/contracts-frd.md` Undecided 6 and worker FR-WRK-070 read 5 minutes; both now
  point here for the deployed value.
- The `.env.example` comment for `KEEPER_CADENCE_S` names 3600 as the deployed value.
