# Checkout `prepare` and `cancel/prepare` require a Privy identity token
2026-09-07 · Decided by William · Status: accepted (closes the "option c, Week 4" clause of the 2026-09-05 FR-API-032 build note)

## Context
Since 2026-09-05 the hosted checkout page has sent the subscriber's wallet address in the body of
`prepare`, trusted by the API and only proven later by the permit signature at `start`. That left
two calls, `prepare` and `cancel/prepare`, that bind an identity to a session on nothing but a
wallet address and a session id. The Privy app now exists (first real checkout ran 2026-09-06),
so the deferred identity check can land. Seven questions were grilled; all took the recommended
answer.

## Decision
1. **Identity token, not access token.** Privy's identity token carries the user's linked
   accounts and is signed with the app's ES256 verification key, so the API verifies it offline
   and reads the wallet from it. No Privy API call on the hot path, no app secret on the server.
2. **Scope: the two binding calls.** `prepare` and `cancel/prepare` require the token. `start`
   and `cancel` stay proven by signatures that must recover to the Customer's wallet.
3. **Unconfigured means refused, not bypassed.** Without `PRIVY_APP_ID` and
   `PRIVY_VERIFICATION_KEY` the API starts, merchant routes work, and the two binding calls
   answer `503 subscriber_auth_unconfigured`. Test mode gets no bypass.
4. **Verifier: Hono's built-in `jwt` helper** (ES256 over WebCrypto, which Bun has). Zero new
   dependencies; the claims check is ours and unit-tested with a local key pair.
5. **Failures: one 401, one 403, one silent retry.** Every token problem is
   `401 subscriber_auth_invalid` with a single message. A verified token whose wallet is not the
   session's Customer is `403 subscriber_mismatch`. The page refreshes the token and retries once
   on 401, then shows "Sign in again".
6. **The wallet is the Privy embedded wallet only** (`type: wallet`, `chain_type: ethereum`,
   `wallet_client_type: privy`). External wallets in the token are ignored; none present → 401.
7. **Email comes from the token** (`email` account, else `google_oauth`), never from the page.

## Consequences
- The body fields `wallet_address` and `email` leave `prepare`; the page sends `X-Privy-Token`.
- A new `api/.env` pair, `PRIVY_APP_ID` and `PRIVY_VERIFICATION_KEY`, from the Privy dashboard
  (App settings → Basics → Verification key). William's local run needs them before the first
  test checkout after this lands.
- The identity token expires after about an hour; the page fetches a fresh one per binding
  call, so long-open checkout tabs still work.
- Specs: API FR-API-120 rewritten, FR-API-125 added, FR-API-032 and FR-API-082 amended;
  checkout FR-CHK-027 added.
