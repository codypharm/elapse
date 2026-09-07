# The keeper gasses `settleBatch` from per-stream estimates, never from the batch estimate
2026-09-07 · Decided by William · Status: accepted

## Context
`StreamFactory.settleBatch` wraps each `settle()` in `try … catch {}` so one bad stream never
blocks a batch (FR-CON-033). That makes `eth_estimateGas` on the batch unsafe: the estimator
returns the smallest gas at which the outer call does not revert, which is the amount where the
inner settle runs out of gas and the catch swallows it. On testnet a stream that reached its
5-minute cap on 2026-09-05 was "settled" 225 times overnight: every transaction succeeded,
emitted nothing, and burned its full limit (about 0.022 MON each at 102 gwei). The relayer lost
5 MON; the stream stayed `active` in the database because the cap-end event never happened.
On mainnet this would drain the relayer's real MON on every capped or stuck stream, silently.

## Decision
Worker side, no contract change:
1. Each tick the keeper estimates gas for `settle()` directly on every due stream. A direct
   call reverts honestly, so the estimate is real.
2. A stream whose direct estimate reverts is skipped this tick, logged once per hour at most,
   and left for the reconcile pass (FR-IDX-024, no longer parked).
3. The batch is sent with `gas = 25 000 + (sum of direct estimates) x 1.25`.
4. A batch receipt with zero logs for a non-empty batch is logged at error level: it is the
   drain signature.

Rejected: removing the try/catch from the contract (a redeploy, and one reverting stream would
then block every other stream's settlement); a fixed large gas limit (Monad charges the limit,
so that is the same drain with a bigger number).

## Consequences
- The stuck testnet stream ends on the keeper's next tick after this lands; the cancel event
  arrives through the indexer and the subscription is marked canceled.
- Pre-demo checklist gains: relayer MON balance, and `keeper_batch_no_effect` absent from the
  worker log.
- Until this is built, run the worker with `KEEPER=0`.
