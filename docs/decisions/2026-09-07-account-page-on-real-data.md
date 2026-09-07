# `/account` reads real data: both modes with a Test tag, receipts from canceled subscriptions, email receipt built, seeded mock gone from the route
2026-09-07 · Decided by William · Status: accepted

## Context
`/account` was built against an in-memory mock with seeded identities (FR-CHK-025) because
no subscriber account API existed. It is linked from the checkout meter and the receipt, so
after a real run a subscriber lands on invented meters from "Nimbus" and "Halcyon" that
restart on every reload. William saw this after the first end-to-end run and chose to wire the
page to real data (option 1 of three: wire it, unlink and hide it, default to the empty seed).
The API FRD already defines FR-API-121/122/123 (list, invoices, signed cancel) and the
subscriber identity token (FR-API-120); the checkout's signed cancel service exists and takes
the subscription's checkout session. The keeper settles every 5 minutes, so one meter yields
several invoices. The mailer used for magic links is live and the subscriber's email is in
the identity token.

## Decision
1. **Both modes on one page.** Every `active`, `paused` or `canceled` subscription whose
   Customer wallet is the caller's, across merchants, test and live. Test-mode rows carry a
   small "Test" tag, the only mode word on the page. Nothing a subscriber paid for is hidden,
   and until mainnet every meter is a testnet one anyway.
2. **Receipts come from canceled subscriptions**, which already carry total seconds and total
   settled. One line per ended meter, no merging on the page. FR-API-122 (invoices) is deferred.
3. **Email receipt is built now**: one route sends a plain receipt through the existing mailer
   to the identity's email, rate-limited to one per receipt per ten minutes, and the button
   works on the checkout receipt too, closing its "not available" path.
4. **The `?as=` seeds leave the route.** The mock stays behind the `AccountApi` interface for
   component tests only; a visitor can never reach invented data again.

Derived, not decided: identity is the Privy identity token on every account route (FR-API-120,
same verifier as prepare); account cancel reuses the checkout cancel service through the
subscription's session; sign-in reuses the checkout's Face ID sheet and provider; rows tick the
way the checkout does and the page polls until a cancel is confirmed by ingest; `incomplete`
subscriptions are never shown.

Rejected: live-only (empty for every judge until mainnet); two sections by mode (structure a
subscriber does not need); hiding the Email receipt button (a dead end on both receipts);
keeping the seeds behind a development check (one more path to fake data).

## Consequences
- `docs/specs/api-frd.md`: FR-API-121 amended (carries `livemode`, `seconds_elapsed`,
  `settled_usd`, `refunded_usd`, `ended_reason`, `max_duration_seconds`; identity token
  auth), FR-API-122 deferred, FR-API-123 amended (cancel prepare step; receipt email route).
- `docs/specs/checkout-frd.md`: FR-CHK-018/020/025 amended, FR-CHK-029 added.
- `web/src/lib/account/` gains a real client with the same `AccountApi` shape; the route stops
  reading `?as=`; the checkout's real client gains `emailReceipt`.
