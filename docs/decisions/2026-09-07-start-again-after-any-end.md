# Start again is offered on every receipt and opens a copy of the ended session on the merchant's behalf
2026-09-07 · Decided by William · Status: accepted

## Context
FR-CHK-007 put a "Start again" button on the receipt only when the meter ended at its cap, and
only the mock implemented it; the real API had no route, so the button was hidden on real
sessions and a receipt after a cancel ended with "Back to {merchant}". The demo video ends on
that receipt. Checkout sessions are created only with a merchant's secret key today.

## Decision
1. **Start again appears on every receipt**, cancel or cap. One tap opens a fresh session for
   the same product and lands on the cap step with the last choice preselected.
2. **Elapse opens the follow-on session on the merchant's behalf, allowed by default.** The
   subscriber's identity token authorises `POST /v1/checkout/sessions/:id/again`; the new
   session copies the ended one (product, success and cancel URLs, the merchant's fixed cap if
   any, the customer). It is refused while the original has not ended and when the product is
   archived. The merchant learns the way it always does: `checkout.session.completed` when the
   new meter starts, carrying the new session id, so an integration keyed on session ids (the
   example app's entitlement map) needs no change. No merchant setting.

Rejected: cap-only (a subscriber who stopped early must go back to the merchant's page);
merchant opt-in per session (a flag every merchant would have to set to get the behaviour
they expect, for no money-movement gain: the subscriber's own permit still funds every start).

## Consequences
- `docs/specs/api-frd.md` FR-API-126 added; `docs/specs/checkout-frd.md` FR-CHK-007 amended and
  the "hidden on real sessions" note removed.
- The subscriber can chain sessions without the merchant's page; the merchant sees one
  `checkout.session.completed` per session, as before.
