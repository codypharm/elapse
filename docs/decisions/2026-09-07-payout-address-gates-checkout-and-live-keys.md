# Payout address: optional at setup, required to create Checkout sessions and to go live
2026-09-07 · Decided by William · Status: accepted

## Context
First-run capture (FR-DSH-013) lets a merchant skip the payout address, but `start` refuses a
meter without one (FR-API-032). William's first identity-check run hit exactly that: the
subscriber saw "The merchant has not set a payout address." The failure landed on the wrong
person at the wrong moment, and a merchant who forgets could publish a live integration that
fails for every subscriber.

## Decision
Stripe's line: explore freely, be blocked only when money is about to move.
1. Setup keeps the payout address optional.
2. Creating a Checkout session without one is refused, in both modes, with a sentence naming
   the fix. The failure happens in the merchant's own code on their first test, before any
   subscriber exists.
3. The dashboard shows one persistent banner until the address is set.
4. Live keys are not issued until it is set, so a live integration without a payout address
   cannot be published. Existing live keys keep working.
5. `start` keeps its guard as the last line of defence.

Rejected: requiring the address at setup (wrong first ask for a developer evaluating in an
afternoon); only rewording the subscriber-facing error (the subscriber still hits the wall).

## Consequences
- Specs: API FR-API-035/036; dashboard FR-DSH-015/075.
- The example app's `npm start` fails with the sentence if its merchant has no address; the
  README's Prerequisites gain that line.
- Test-mode exploration is unchanged except for the one step that produces a checkout link.
