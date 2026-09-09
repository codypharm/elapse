# Dashboard search shows results as you type, backed by one merchant-scoped search route
2026-09-09 · Decided by William · Status: accepted

## Context
The top-bar search (FR-DSH-005) took a whole id or an email and did nothing until Enter,
then either navigated or raised a toast. Ids in Elapse are `prefix_random`; a merchant reading
one off a log or a support ticket rarely has all of it, and typing gave no feedback at all.
After the judge pass William asked for the typing experience to improve. Three shapes were
offered: results as you type (needs one new API route), an inline hint line with states and
no dropdown (no API change), or both. William chose results as you type.

## Decision
One new dashboard-session route, `GET /v1/dashboard/search?q=`, returns at most five matches
across products, customers, subscriptions, events, webhook endpoints and checkout sessions for
the current mode: id prefix match, or a case-insensitive substring of a customer email or a
product name. Each row is `{type, id, label, detail}`; the response never carries a key, a
secret, or an event payload. The search box debounces 200 ms after the second character, lists
the rows under the input with full keyboard control (arrows, Enter, Esc), says "No match in
test mode" inline instead of a toast, and keeps the old Enter-to-resolve path when no list is
open. The inline hint line was not taken: the result list is the hint.

## Consequences
Search becomes useful with a partial id. One more dashboard route (FR-API-135) with its own
scope test, one more mock-API method, and the search box gains list semantics and a test file
of its own. Specs: dashboard FR-DSH-005 (amended), API FR-API-135.
