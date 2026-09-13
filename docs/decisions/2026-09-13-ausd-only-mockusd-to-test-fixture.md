# AUSD is the only escrow token; MockUSD becomes a test fixture; live mode is mainnet's mode

2026-09-13 · Decided by William · Status: accepted

## Context

The first live-mode run passed end to end on real testnet AUSD (2026-09-11), and the
[faucet ADR](./2026-09-11-testnet-ausd-from-agora-faucet.md) means we can fund any wallet with
AUSD ourselves. Yet the platform still carried a second money: test mode escrowed `MockUSD`,
which the relayer mints to a short wallet inside checkout (`isMintable`, FR-API-032), while live
mode escrowed AUSD. Two tokens meant two behaviours to explain, a mint path in the money code,
and a "test dollars" story in the docs that is not how the product will ever work on mainnet.

William asked for the mock token to be removed and for the modes to mean what Stripe's mean:
test is the testnet, live is (destined for) mainnet, and the money is AUSD everywhere. Grilled
2026-09-13; five decisions below are the answers (Q1 C, Q2 A, Q3 B, Q4 B, Q5 A).

## Decision

1. **AUSD is the only escrow token, in both modes.** The escrow token is a property of the
   chain, not of the mode: `escrowTokenFor(chainId)` returns the chain record's AUSD,
   unconditionally. Mode maps to chain — test mode is Monad testnet 10143 permanently; live
   mode is 10143 only until a chain-143 deployment record exists, then mainnet 143 with mainnet
   AUSD, with no integration change for merchants.
2. **No mint path exists anywhere** (Q1, option C). The relayer's `mintMock`, `isMintable`, and
   checkout's top-up branch are deleted. A wallet short of the cap gets `insufficient_balance`
   and the Add funds step in **both** modes (Q2, option A: the proven FR-CHK-031 screen,
   unchanged, stops being live-only). No platform pool, no faucet call on a user path.
3. **MockUSD is demoted to a Foundry test fixture** (Q4, option B). The contract file survives
   under `contracts/` solely as the mintable ERC-2612 double the forge suite needs. It is never
   deployed, `Deploy.s.sol` stops creating it, the `mockUsd` field leaves the deployment
   records, and `KillGate.s.sol` defaults to AUSD.
4. **Live mode carries a permanent merchant-facing banner until mainnet** (Q3, option B):
   *"Live mode settles real AUSD. Until mainnet launch it runs on Monad testnet; at launch it
   moves to mainnet AUSD with no integration change."* Dashboard only — the subscriber surface
   admits no chain words (BR-CHK-001) — not dismissible, gone automatically when the live chain
   is 143. Same sentence in the docs.
5. **The judge pass becomes a driven demo** (Q5, option A). With no minting, no mode is
   self-serve: demo subscriber wallets are pre-funded by the team from the holding wallet, the
   submission points judges at the video and a funded pass. A one-tap "Get testnet AUSD" faucet
   button is recorded in `docs/post-hackathon.md` as a deferred candidate, not built.

Supersedes the token-per-mode clauses of
[ADR 2026-09-07 testnet submission](./2026-09-07-submission-on-testnet-live-mode-mockusd.md)
(test mode on MockUSD, mint keyed off the token) and of
[ADR 2026-09-07 add money](./2026-09-07-add-money-and-ausd-live-on-testnet.md) (mode-aware
escrow token on 10143). The Add funds screen those ADRs introduced stays — it simply runs in
both modes now.

## Consequences

- The money code loses a whole concept: one token, no mint, `escrowTokenFor` keyed by chain
  alone. FR-API-032/034/048, FR-CHK-003/031, FR-CON-063 and FR-DSH-003 carry the amendments.
- The frictionless test checkout is gone. A judge exploring alone hits Add funds with a wallet
  they cannot fund; demos are driven with pre-funded wallets, the same drill as the live run.
- The Agora faucet still has **zero user-facing dependents** — it funds team and demo wallets
  only, so the risk posture of the faucet ADR is unchanged.
- Existing MockUSD streams need no migration: ingest, keeper and indexer key on the stream
  address and never on the token, so they settle and cancel exactly as before.
- Docs pages that teach "in test mode the platform hands out test dollars" (`checkout.mdx`,
  `testing.mdx`, the `contracts.mdx` token table, quickstart cap advice) are rewritten during
  the build.
- Watch: testnet AUSD spend now applies to *every* demo checkout, so the holding wallet's
  balance joins MON as a pre-demo check.
