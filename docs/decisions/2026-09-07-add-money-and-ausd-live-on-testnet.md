# Add money on the checkout when the wallet is short; live mode escrows AUSD on testnet
2026-09-07 · Decided by William · Status: accepted

## Context
The permit model ([ADR 2026-09-04](./2026-09-04-subscriber-permit-relayer-signs.md)) left "how
dollars get into the subscriber's wallet" outside Elapse for 13 October, and the testnet
decision earlier today ([ADR 2026-09-07 testnet submission](./2026-09-07-submission-on-testnet-live-mode-mockusd.md))
put live mode on MockUSD because the team held no AUSD. Both together hid a real gap: a real
subscriber with an empty wallet signs with Face ID, then Start fails with "not enough funds"
and no way forward. The team will now hold AUSD on Monad testnet, and William wants the video
to show the whole flow: sign in, add money, watch it arrive, choose a cap, start, stop.

Verified on chain before deciding: AUSD on testnet (`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`)
has 6 decimals, exposes `nonces` and `eip712Domain()` (name "Agora Dollar", version "1"), and
its `DOMAIN_SEPARATOR` matches a recomputation from those fields, so the permit path holds.

## Decision
1. **Add money appears before signing.** Once signed in, the checkout reads the wallet's balance.
   The cap step shows "You have $X available", greys out presets above it, and when nothing
   is affordable shows Add money in place of Continue. A Start that still fails for funds
   lands on the same screen. The subscriber never signs a permit that will fail.
2. **The screen shows the current balance, the amount still needed, a QR code and the
   receiving address with Copy, and one sentence naming the token and the network.** It polls
   the balance every five seconds, the balance figure ticks up when money lands, and it
   returns to the cap step by itself once the chosen cap is affordable. No token contract,
   no explorer link, no fee talk. This is the second place chain words appear on the
   subscriber side (BR-CHK-001 exception), because a person sending money must know what to
   send and where.
3. **Checkout only.** The account page stays meters and receipts; a balance line there can
   follow the video.
4. **The seeded demo gets `/c/cs_short`**: a mock session whose wallet is short and fills up
   after a few seconds, so the screen can be seen and tested without a chain.
5. **Live mode escrows AUSD on testnet; test mode keeps MockUSD with the free mint.** This
   supersedes decision 2 of the testnet ADR (live mode on MockUSD). Minting stays keyed to the
   token, so only live wallets can be short and only there does Add money appear. The video
   runs in live mode with a wallet William funds on camera.

Rejected: Add money only after Start fails (a Face ID confirmation followed by "no money"
reads as a broken payment); both modes on AUSD (every first test would need funded AUSD, which
kills "integrate in an afternoon"); a fiat on-ramp in the checkout (no provider sells AUSD on
Monad today; a partner conversation for after the submission).

## Consequences
- `docs/specs/checkout-frd.md` FR-CHK-003 amended, FR-CHK-031 added, BR-CHK-001 gains the
  exception, mock state `cs_short`.
- `docs/specs/api-frd.md` FR-API-034 amended (AUSD in live mode on 10143), FR-API-048 balance
  read added.
- `escrowTokenFor` becomes mode-aware on testnet; `contracts/deployments/10143.json` already
  carries the AUSD address. Live products created before this keep working: the token is read
  at session prepare, not stored on the product.
- A live checkout link still needs an https success URL, so the recording either creates the
  session by API or runs the example app behind an https tunnel.
