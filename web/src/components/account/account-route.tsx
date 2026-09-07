/**
 * Client entry for `/account` (ADR 2026-09-07 account on real data): the wallet layer wraps
 * the page when the API is configured, and the page waits for the device's sign-in to be
 * restored so its first read carries the identity token. No seeds, no `?as=`.
 *
 * Maps to: FR-CHK-016, FR-CHK-018, FR-CHK-025.
 */
"use client";

import { useMemo } from "react";
import { getAccountApi, usesRealAccountApi } from "@/lib/account/client";
import { useAuthFlow } from "@/lib/checkout/auth-flow";
import { PrivyCheckout } from "@/lib/checkout/privy/privy-checkout";
import { AccountFrame } from "./account-frame";
import { AccountPage } from "./account-page";

function GatedAccount() {
  const flow = useAuthFlow();
  const api = useMemo(() => getAccountApi(), []);
  const real = usesRealAccountApi();
  if (real && flow.ready === false) {
    return (
      <AccountFrame>
        <p className="py-10 text-center text-sm text-ink-soft" aria-busy>
          Checking your sign-in…
        </p>
      </AccountFrame>
    );
  }
  return <AccountPage api={api} pollMs={real ? 5000 : 1000} email={real ? (flow.email ?? null) : undefined} />;
}

export function AccountRoute() {
  const page = <GatedAccount />;
  return usesRealAccountApi() ? <PrivyCheckout>{page}</PrivyCheckout> : page;
}
