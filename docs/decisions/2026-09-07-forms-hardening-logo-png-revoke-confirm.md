# Forms hardening: rate read-only on edit, PNG-only logo in Postgres, type-to-confirm on live key revoke
2026-09-07 · Decided by William · Status: accepted

## Context
After the Week 4 end-to-end run William asked for every form in `web/` to be hardened,
security first. The inventory (all forms, their client checks, the server zod schema behind
each) found three places where the UI lies: the product drawer shows an editable rate on edit
and discards the change (FR-API-011 makes the rate immutable, and the update body has no rate
field); the branding form previews an uploaded logo and reports "saved" while the client never
sends it and FR-API-104 was never built; and the profile form cannot save a business name on
its own because empty support fields are sent as `""`. It also found no input in the app with a
`maxLength` or `pattern`, the server's per-field `param` unread by any component, unencoded
search text in request paths, no client check on merchant colour or URL before they reach
checkout styles, an uncapped webhook URL, and CSV exports that do not neutralise formula
prefixes. Revoking a live key had no type-to-confirm while deleting test data does.

## Decision
1. **Rate stays immutable (FR-API-011).** The edit drawer shows the rate read-only with the
   line "To change the rate, create a new product." A merchant changing price creates a new
   product, points checkout at it, archives the old one; running meters keep the rate they
   started at until the subscriber stops or the cap ends them. No bulk cancel.
2. **Logo upload is built, PNG only, 50 KB cap, no SVG.** Storage stays as decided on
   2026-09-05 (Undecided 9): Postgres `bytea` served from a dashboard route with long cache
   headers, so `logo_url` on sessions and events is a small public URL, not an inline data
   URL. The server validates the PNG signature bytes, never the file name or declared type.
   SVG is dropped: it can carry script and sanitising it is not October work.
3. **Revoking a live key requires typing the key's name**, matching the delete-test-data
   pattern. Test keys revoke on one confirm as before.
4. **Client validation mirrors the server, once.** One shared module holds the field rules
   (lengths, patterns, bounds) copied from the API's zod schemas; every form disables submit
   until valid and shows the rule as a hint. The API client maps the server's `param` to the
   field so a server rejection lands under the input, never only in a toast.
5. **Server side:** webhook URL capped at 2048; support URLs `http(s)` only; CSV cells
   beginning with `=`, `+`, `-`, `@` are prefixed with `'`; search text is URL-encoded before
   it enters a path.

Rejected: allowing rate edits for future meters (reopens FR-API-011 and splits the product
from its running meters); object storage for logos (a hosting decision and a credential in
Week 5); a pasted logo URL (third-party fetch on every checkout).

## Consequences
- `docs/specs/api-frd.md` FR-API-104 amended, FR-API-065/113 added, FR-API-103 support URL
  scheme pinned. `docs/specs/dashboard-frd.md` FR-DSH-103 amended, FR-DSH-114–118 added.
  `docs/specs/checkout-frd.md` FR-CHK-028 added.
- Every form gets a component test for its invalid state and its server-rejection state.
- Follow-up outside this pass: `/account` moves from the mock to real data (option 1, decided
  the same day, its own ADR when grilled).
