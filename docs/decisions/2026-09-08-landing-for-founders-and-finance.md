# The landing speaks to founders and finance owners as well as engineers
2026-09-08 · Decided by William · Status: accepted · Amends the landing FRD problem statement (2026-09-03)

## Context
The landing was written for the merchant engineer: a meter to cancel, the webhook payload,
`npm install`, the SDK surface, a tariff. Every heading is a developer's. The judges of the
Monad Metropolis track are protocol founders and investors who read a landing for the
business: who pays, what the platform keeps, when money lands, and why now. The merchant's
finance owner asks the same questions before approving an integration. William: "it is more
of dev minded now but I want it to be dev and finance minded."

## Decision (grill answers, 2026-09-08)
1. **Reader:** the founder or investor, with the merchant's finance owner folded in. The
   crypto-native reader gets one sentence, not a section.
2. **Hero promise:** the headline `You only pay what elapsed.` stays; the subline turns to the
   merchant: earns per second, paid out as it accrues, integrated like Stripe.
3. **Target merchants:** the tariff becomes the merchant section — four categories (GPU and
   inference clouds, metered APIs, live streaming and events, SaaS seats), each card saying who
   they are, what changes with a second as the unit, and the illustrative rate. Categories,
   never customers (BR-LND-002).
4. **The money:** its own short section — payout as it accrues, the fee as a share of settled
   seconds, automatic refund on stop, no chargebacks — with the fee rendered from the
   deployment record the dashboard reads, never typed into copy.
5. **Meter versus month:** the drawing stays; the words become the merchant's growth argument
   (nobody churns from a meter they can stop).
6. **Calls to action:** two buttons, one per reader — `Start integrating` to the quickstart,
   `See the demo` to the merchant section until the video exists, then the video.
7. **The chain:** one sentence in The money (AUSD on Monad, 400 ms blocks make a second an
   honest unit) plus the existing footer line. BR-LND-001 (no chain words above the fold) holds.
8. **Hero visual:** the meter stays and gains a merchant readout of the same session —
   subscriber paid, merchant received, Elapse kept — from the same meter math, nothing faked.

## Consequences
- Landing FRD gains user stories 5–6 and FR-LND-014–019; FR-LND-009 (tariff) folds into
  FR-LND-016. Order becomes: hero → how it works → meter versus month → merchants → the money
  → event catalog → Stripe-shaped close.
- `pnpm sync-deployments` also copies the record into `web/` so the fee has one source.
- Built under `/impeccable` in the recorded world (`DESIGN.md`); no new visual direction.
- Out of scope: testimonials, logos, pricing tiers, a chain proof section, a third button.
