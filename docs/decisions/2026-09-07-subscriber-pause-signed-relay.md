# Subscriber pause ships as a signed relay in the shape of cancel; "Stop" replaces "Cancel" on the subscriber side
2026-09-07 · Decided by William · Status: accepted

## Context
The contract has had `pause()` and `resume()` since the first deploy (FR-CON-022/023), the
indexer and ingest turn `StreamPaused`/`StreamResumed` into `status: paused` and a
`subscription.updated` event, and the checkout meter shows Pause and Resume against the mock.
But both functions accept only a party's own wallet as sender, and subscribers never hold MON,
so the real checkout threw "Pause is not available yet" and a merchant who switched
`allow_pause` on gave their subscribers a button that failed. The item was parked 2026-09-06.

Cutting it was on the table: cancel plus Start again covers the subscriber, and cancel refunds
the unspent escrow at once where a pause keeps it locked. What pause alone gives is on the
merchant side: the same `sub_` id, the same cap and escrow, and a `subscription.updated`
instead of a `subscription.canceled`, so a GPU session or a stream can stay warm.

## Decision
1. **Build it, as a signed relay.** `pauseFor(deadline, signature)` and
   `resumeFor(deadline, signature)` mirror `cancelFor` (FR-CON-017): a personal-sign digest
   tagged `"ElapsePause"` / `"ElapseResume"` over `(chainId, stream, nonce, deadline)`, signed
   by the subscriber or the merchant, submitted by the relayer, which pays gas. The three
   relayed actions share one counter, renamed `relayNonce`; the tag keeps a signed pause from
   being replayed as a resume. `pause()`/`resume()` from a party's own wallet stay.
2. **The keeper does not get pause or resume.** Keeper cancel was safe because cancel only ever
   pays elapsed seconds and refunds the rest. Pause holds a subscriber's money idle and resume
   restarts their charges; neither may happen without the party's signature.
3. **No money moves on pause or resume.** Accrual freezes and restarts; escrow stays in the
   stream. A pause that observes the cap already reached ends the stream, exactly as `pause()`
   does today (FR-CON-041). Cancel from `Paused` stays as built: settles to the pause instant,
   refunds the rest.
4. **Checkout and account both offer it**, shown only when the product allows pause. One tap,
   no confirmation sheet: nothing is charged or refunded and the action is reversible. Routes
   under the checkout session and under the account subscription take the shape of the cancel
   routes: `pause/prepare`, `pause`, `resume/prepare`, `resume`, bound to the identity token.
5. **Ten pause-or-resume actions per subscription per hour**, then `429`, the limit Start
   again already uses. Each action is a relayer transaction and a merchant webhook.
6. **Fresh factory on testnet.** William redeploys implementation and factory from the
   `elapse-dev` keystore with the relayer set as keeper in the deploy script; the indexer
   watches the new factory only. No running meter exists to orphan.
7. **The demo product keeps `allow_pause` off.** The video stays start → stop at 83 s → pay
   83 s. Pause is shown by the docs and by any product a judge creates with the switch on.
8. **"Stop" replaces "Cancel" on the subscriber side only**: the checkout meter's button and
   the cap step's sentence. The account page already said Stop. The dashboard keeps Stripe
   vocabulary (`Cancel meter`, status `Canceled`) because merchants map it to
   `subscriptions.cancel` and `subscription.canceled`, which are frozen. The landing hook
   "Cancel at 83 seconds. Pay 83 seconds." stays blunt on purpose (CLAUDE.md).

Rejected: cutting pause for the submission (a defer would have been fine, but the redeploy
comes at the same cost now as after 13 October and the merchant feature is real); keeper
pause/resume (power over a subscriber's money without their signature); separate nonces per
action (state for no security gain); one generic `actFor(action, …)` (hides the action from
the indexer and readers); a minimum paused time before Resume (an honest wrong tap would wait).

## Consequences
- `docs/specs/contracts-frd.md` FR-CON-018 added, FR-CON-017 amended (`relayNonce`); money
  movement unchanged, but the accrual clock and a redeploy are touched, so William signs.
- `docs/specs/api-frd.md` FR-API-044..047 added (checkout and account pause/resume routes,
  rate limit), FR-API-043 superseded.
- `docs/specs/checkout-frd.md` FR-CHK-005 reworded, FR-CHK-030 added, FR-CHK-018 amended, the
  parked Open item closed.
- `contracts/deployments/10143.json`, the API's copy, and the indexer start block change at
  redeploy; existing canceled streams remain in Postgres as history.
