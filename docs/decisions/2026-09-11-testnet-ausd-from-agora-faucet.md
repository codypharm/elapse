# Testnet AUSD comes from Agora's undocumented Monad faucet; used for team and demo wallets only

2026-09-11 · Decided by Furqaan · Status: accepted

## Context

The contracts FRD (Open, "Funding the kill-gate wallet", checked 2026-09-05) recorded that we
could not put AUSD into a wallet ourselves: testnet AUSD's `mint` is access-controlled, the
token exposes no public faucet, and every Monad faucet dispenses MON for gas only. The
conclusion was to run the kill gate on `MockUSD` and ask Agora or the Monad organisers to send
us testnet AUSD before 13 October. The [Add money ADR](./2026-09-07-add-money-and-ausd-live-on-testnet.md)
likewise had William funding the demo wallet on camera from a supply we did not yet have.

That premise was wrong. Agora's faucet page documents a `requestFunds` faucet on Sepolia only,
but the same faucet address is also deployed on Monad testnet and pays out AUSD, undocumented.
Verified on chain 2026-09-11 and then used: Furqaan sent a real `requestFunds` transaction
(`0x2b016a463a01ec6f6d20f52c23964e977c55fb7af4ecb99aa7333141f5cf554a`) and `0x35134987…7817`
received 10,000 AUSD.

The faucet, on chain 10143:

| | |
| --- | --- |
| Faucet | `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C` (proxy; pays the AUSD at `0xa9012a…22dC`) |
| Call | `requestFunds(address recipient)` — caller pays MON gas, recipient is arbitrary |
| `faucetDripAmount` | 10,000 AUSD per call (`1e10` base units, 6 decimals) |
| `maxDripFrequency` | 60 s, tracked by a **single global** `lastDripTimestamp` — the cooldown is shared across all callers, not per address |
| `maxAmountToOwn` | 100,000 AUSD — the faucet refuses a recipient already at or above this |
| Whitelist / KYC | none; the call checks only the two balances |
| Balance 2026-09-11 | ~660,000 AUSD after our draw, ~66 payouts remaining |

The CTK/AUSD settlement pair (`0x1Aa8…b0ae`) also holds ~1M AUSD at 1:1, but reaching it needs
CTK (whose faucet is not deployed on Monad) and, per Agora's docs, KYC — so it is not a route.

## Decision

1. **Testnet AUSD is obtained by calling `requestFunds` on the Agora faucet above.** This closes
   the "ask Agora or the Monad organisers" lead-time item; no external request is needed.
2. **The kill gate and the Add-money demo run against real AUSD**, funded this way, not only
   against `MockUSD`.
3. **The faucet funds team and demo wallets only. No Elapse process calls it.** In particular the
   live-mode checkout does not fall back to the faucet for a short subscriber wallet — Add money
   stays as specified ([ADR 2026-09-07](./2026-09-07-add-money-and-ausd-live-on-testnet.md)).
   Reasons: it is undocumented and may be drained or removed without notice; the 60-second global
   cooldown and 66 remaining payouts make it unfit for a live path; and minting stays keyed to the
   token (`MockUSD` only) so the test/live boundary does not blur.

## Consequences

- The contracts FRD Open item on funding the kill-gate wallet is stale and is corrected in the
  same change that lands this ADR.
- The team can top up any testnet wallet on demand, respecting the 60 s shared cooldown and the
  100,000-per-wallet ceiling. The sending wallet needs MON for gas (<https://faucet.monad.xyz>).
- Dependence risk is accepted only for internal wallets: if the faucet empties or disappears, the
  fallback is `MockUSD` (unchanged) plus a direct request to Agora — no user-facing path breaks,
  because none depends on it.
- Nothing in `api/`, `web/`, or `contracts/` changes; this is an operational source, recorded so
  the next person does not re-derive "we have no way to get AUSD".
