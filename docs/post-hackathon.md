# Post-hackathon — what we knowingly left

Everything here is **known and deliberately not fixed before 13 October 2026**. Nothing on this
page blocks the submission; each item names where it is recorded, so the spec stays the source of
truth and this page stays an index.

Two rules for this file. An item arrives here only after the human decides to defer it, never
because the agent judged it unimportant. An item leaves only when it is fixed or superseded, and
the spec that owns it is updated in the same change.

## Defects found and deferred

| Item | Where recorded | Reach | Fix |
| --- | --- | --- | --- |
| **Merchant-fixed cap is unusable on the page.** A session created with `max_duration_seconds` is rejected at `prepare` with `cap_fixed` for any cap the subscriber picks. `real-api.ts` types the field but its mapper surfaces only `last_max_duration_seconds`, so `CapStep` never learns the cap is fixed and always renders a free picker. | [`specs/checkout-frd.md`](./specs/checkout-frd.md) → Open, 2026-09-11 | Not the dashboard (no UI sets the field) and not `examples/saas`. Does reach anyone following `checkout.mdx`, `sdks.mdx` or `testing.mdx`, all of which teach the parameter. | Client only, the API is correct: carry `max_duration_seconds` through the mapper and render a fixed cap as a stated duration instead of a picker. One mapper field, one branch, plus tests. |
| **A subscriber who picks an unaffordable cap is stranded.** The Add funds screen polls and advances by itself once the balance covers the cap, but offers no way back to the cap step — only "Not now", which leaves checkout. | This page. William decided 2026-09-11 to leave it. | A judge who tops up less than the cap on their own phone reaches a dead end. Does not affect a demo the team drives. | A Back control on the cap-step entry path only. The ready-view path has no cap step to return to, so it keeps funding or "Not now". Changes FR-CHK-031. |

## Deferred by decision

| Item | Decided | Where |
| --- | --- | --- |
| **Python SDK.** TypeScript only for the submission; Python is the first SDK item after it, built against the same FRD. | 2026-09-07, William | [ADR](./decisions/2026-09-07-sdk-typescript-only-for-submission.md), [`specs/sdk-frd.md`](./specs/sdk-frd.md) |
| **Amount-based settlement.** The keeper settles on a clock (hourly). Settling on accrued amount is the mainnet question. | 2026-09-08, William | [ADR](./decisions/2026-09-08-keeper-cadence-one-hour.md), [`specs/contracts-frd.md`](./specs/contracts-frd.md) |
| **Reorg handling.** `rollback_on_reorg: false` with `block_hash` stored on every row, to be revisited (FR-IDX-030). | 2026-09-06 | [`specs/indexer-frd.md`](./specs/indexer-frd.md) |
| **CLI device-code login.** `elapse login` pastes the key at a hidden prompt; a device-code flow is post-hackathon (FR-CLI-002). | 2026-09-06, William | [ADR](./decisions/2026-09-06-cli-transport-and-session.md), [`specs/cli-frd.md`](./specs/cli-frd.md) |
| **Test clocks / time travel** (FR-API-090/091). The demo cancels after real seconds; the docs page became "Testing" instead. | 2026-09-06, William | [`specs/api-frd.md`](./specs/api-frd.md) |
| **Delivery rate limiting per endpoint** (e.g. max 20 in flight). Not needed at MVP volume. | — | [`specs/worker-frd.md`](./specs/worker-frd.md) |
| **Mera wallet.** Privy only for subscribers; Mera revisited after submission. | — | [`architecture.md`](./architecture.md) |
| **Merchant-set cap in the dashboard.** `max_duration_seconds` is API-only; the dashboard's checkout link always leaves the cap to the subscriber. Defensible, but worth deciding on its own merits rather than by omission. | Raised 2026-09-11, William | This page |

## Operational

| Item | Note |
| --- | --- |
| **Mainnet.** The submission runs on Monad testnet 10143. Live mode moves to chain 143 and mainnet AUSD `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` afterwards; MockUSD never leaves testnet. | [ADR 2026-09-07](./decisions/2026-09-07-add-money-and-ausd-live-on-testnet.md) |
| **`hello@elapse.finance` has no inbox.** The dashboard settings links point at it. William sets one up after the hackathon, probably Zoho. Do not build a contact form or change the address before then. | William, 2026-09-09 |
| **Testnet AUSD depends on an undocumented faucet.** Agora's `requestFunds` on Monad testnet funds team and demo wallets. If it empties or disappears the fallback is MockUSD plus a direct request to Agora; no user-facing path depends on it. | [ADR 2026-09-11](./decisions/2026-09-11-testnet-ausd-from-agora-faucet.md) |

## Revision

| Date | Who | Change |
| --- | --- | --- |
| 2026-09-11 | Claude (for William) | Created after the first live-mode run on the hosted app. Collected the items already deferred across the FRDs and ADRs, and added the four findings from that run. |
| 2026-09-11 | Claude (for William) | Docs gap fixed, so removed: the quickstart's first step now says an `export` lasts only as long as the terminal and to put both variables in `.env` and the host's environment settings. |
| 2026-09-11 | Claude (for William) | CLI version banner fixed, so removed: `listen.ts` had a hardcoded `0.1.0` and the test fixture pinned it, which is how it drifted. The banner now reads `CLI_VERSION`, the test asserts the running version, and `cli-listen.mdx` on the docs site regenerated to 0.1.2. |
