# The support URL is one field, in the business profile; checkout branding no longer repeats it
2026-09-07 · Decided by William · Status: accepted

## Context
Settings asked for a Support URL twice: under Business profile (beside the support email) and
under Checkout branding (beside the logo and accent). Both wrote the same `merchants.support_url`
column, each with its own Save button, so the last save won and a merchant who filled one saw the
other apparently empty. Found in the QA pass before the judge pass.

## Decision
The field lives in Business profile only. Checkout branding keeps display name, logo and accent,
the purely visual settings. The hosted checkout's Support link and the 390 px preview read the
profile value, as they already did. The web client stops sending `branding.support_url`; the API
keeps accepting it (optional) so nothing else changes.

Rejected: keeping it in branding only (a support link is a business fact, not a look).

## Consequences
- `docs/specs/dashboard-frd.md` FR-DSH-103 amended; one Settings test replaced.
- No API or schema change.
