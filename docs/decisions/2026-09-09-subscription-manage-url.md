# The Subscription carries `manage_url`: merchants link subscribers to the hosted meter page to pause, resume or stop
2026-09-09 · Decided by William · Status: accepted

## Context
During the judge pass William asked how a merchant's own app lets a service owner pause a
meter. It cannot: pause and resume move the subscriber's escrow and the contract takes the
subscriber's signature, relayed by Elapse ([ADR 2026-09-07 subscriber pause](./2026-09-07-subscriber-pause-signed-relay.md)),
and merchant pause was refused on the dashboard ([ADR 2026-09-03 dashboard scope](./2026-09-03-dashboard-scope.md)).
The subscriber already has the hosted pages: the checkout session page shows Pause (when the
Product allows it) and Stop while the meter runs, and the receipt after; the account page lists
every meter across merchants. Nothing told a merchant to link there, and nothing gave them the
link without building it from the session id by hand. This is Stripe's Customer Portal pattern:
the merchant redirects, the hosted page does the work.

Three options were weighed: docs only; a `manage_url` field on the Subscription; embeddable
pause and stop inside the merchant's page. The third is real work and stays after the
submission. The first costs nothing but leaves merchants assembling URLs.

## Decision
The Subscription object gains `manage_url`, the hosted checkout session page for that
subscription (`{checkout base}/c/{cs_…}`). It points at the session page, not the account
page: one meter, no other merchants' meters beside it, sign-in handled, Pause and Stop while
running, the receipt after cancel. It is always a string, including after cancel, so a
merchant's "Manage your meter" link never needs a second case. It appears wherever the
Subscription object appears: `subscriptions.retrieve`/`list`/`cancel` and every
`subscription.*` event. The SDK surface stays at ten methods; only the type widens. No
merchant pause or resume route exists; "start again" is a new checkout session, because a
canceled stream is final on chain.

## Consequences
Merchants drop a link and get pause, resume and stop with no code. Event bodies grow by one
field (additive; signatures cover the new bytes as any other). The docs Subscriptions page gains
a "Let subscribers manage their meter" section. Embeddable subscriber controls remain the
post-submission path. Specs: API FR-API-040, SDK FR-SDK-005, docs FR-DOC-022.
