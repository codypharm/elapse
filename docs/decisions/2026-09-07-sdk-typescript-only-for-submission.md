# The submission ships `@elapse/sdk` (TypeScript) only; the Python package waits
2026-09-07 · Decided by William · Status: accepted

## Context
The SDK FRD defines a Python package `elapse` as a Week 5 stretch (FR-SDK-040) and says what
happens if it slips (FR-SDK-041): not published, docs show TypeScript and cURL only. Week 5
now also carries the live-on-testnet change
([2026-09-07](./2026-09-07-submission-on-testnet-live-mode-mockusd.md)), the relayer wallet
swap, the judge pass and the demo video. A minimal Python package (client, `construct_event`,
four core methods, shared signature vectors under pytest, PyPI, docs page, CI job) is about two
days.

## Decision
TypeScript only for 13 October. FR-SDK-041 applies: `sdk/python/` is not published, the docs
SDK page keeps TypeScript and cURL, and no surface says "Python coming". Python is the first
SDK item after submission, built against the same FRD.

Rejected: the minimal package (two days out of the mainnet-free but still full Week 5 for a
line on a slide); a Python webhook-verification-only package (a half SDK on the docs page is
the "coming soon" the working agreement forbids).

## Consequences
- `docs/specs/sdk-frd.md` status and `docs/specs/README.md` record the freeze; nothing in
  `docs-site/` changes because it never showed Python.
- Week 5 time goes to the testnet-live change, the relayer swap, judge pass and video.
