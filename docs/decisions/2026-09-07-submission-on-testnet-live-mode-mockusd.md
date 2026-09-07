# The 13 October submission runs on Monad testnet; live mode points at testnet too; the relayer gets its own wallet now
2026-09-07 · Decided by William · Status: accepted

## Context
The detailed doc's six-week plan puts a mainnet factory and real AUSD in Week 5, and the API
was built that way: test mode on chain 10143 with `MockUSD` minted by the relayer, live mode on
chain 143 with AUSD and no mint (Undecided 4, decided 2026-09-05; FR-API-032/034). No mainnet
deployment record exists, so today a live key can be issued but a live Checkout link fails with
a server error. AUSD is not available to the team yet. On testnet one wallet
(`0xaf1444aBF40aFC91Bcb4A6793765553c6BcceA0d`) is the factory owner, the fee treasury and the
relayer at once, and its key sits in the API host's environment; after the keeper-gas drain
([2026-09-07](./2026-09-07-keeper-gas-per-stream-estimate.md)) William asked which of these
roles must be separated, and when.

## Decision
The hackathon submission runs entirely on Monad testnet (10143). Live mode is not hidden and
not pointed at a chain that does not exist: **both modes use the testnet factory and escrow
`MockUSD`, and the relayer tops the subscriber up in both modes**, so a live demo starts from an
empty wallet exactly as a test demo does. Test and live remain separate data with separate
keys. The FR-API-034 balance check stays in code but is gated on "the escrow token cannot be
minted", which is true only once a chain-143 record with AUSD exists.

Wallet roles are split now so mainnet is a replication, not a redesign: the current wallet
stays **factory owner and fee treasury**; a **new EOA becomes the relayer** (the factory's
`keeper`, set by the owner with `setKeeper`), funded with testnet MON only, its key held only in
the API host's environment. William holds the owner key; Furqaan gets the address for
watch-only. A hardware wallet or a two-signer multisig for the owner/treasury, and the mainnet
factory itself, are post-submission work, and William, not Furqaan, deploys contracts.

Rejected: hiding live mode behind a flag until mainnet (removes surface judges may flip);
testnet AUSD in live mode (permit support unverified, no faucet, demos would fail on the
balance check); sharing the owner private key with Furqaan (a copied key cannot be revoked;
viewing needs only the address).

## Consequences
- `config.chains.live` becomes 10143 until a mainnet record lands; the mint and the balance
  check key off the token, not the mode. The test that pinned live mode to the testnet record
  loses its workaround.
- Deploy record for chain 143, real AUSD and the live balance check in anger move to after
  13 October, together with the hardware-wallet or multisig upgrade (one `setFee` call and one
  ownership transfer, no redeploy).
- Operational steps, in order: create the relayer EOA and fund it with testnet MON; owner calls
  `StreamFactory.setKeeper(newRelayer)`; the API host's `RELAYER_PRIVATE_KEY` swaps to the new
  key; restart API and worker. Until step 2 lands, the new relayer cannot cancel on a party's
  behalf.
- Pre-demo checklist names two balances: MON on the relayer, and the owner wallet's
  `MockUSD` fee income as the sanity check that fees flow.
- Supersedes the live-chain half of Undecided 4 (2026-09-05, recorded in `docs/specs/api-frd.md`);
  the test-mode half stands.
