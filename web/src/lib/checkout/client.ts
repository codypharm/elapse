/**
 * The checkout API the browser uses. One module-level instance per mode so state persists
 * across renders within a tab. The seeded demo ids (FR-CHK-015) always use the in-memory
 * mock; every other id uses the real API when `NEXT_PUBLIC_ELAPSE_API_URL` is set.
 * The hosted page sends no key: the session id is the pass (decided 2026-09-05, option a).
 */
"use client";

import { createMockCheckoutApi, SEEDED_SESSION_IDS, type CheckoutApi } from "./mock-api";
import { createRealCheckoutApi, type SubscriberWallet } from "./real-api";

const API_URL = process.env.NEXT_PUBLIC_ELAPSE_API_URL;

let mock: CheckoutApi | null = null;
let real: CheckoutApi | null = null;
let wallet: SubscriberWallet | null = null;
let identityToken: (() => Promise<string | null>) | null = null;

/** Set by the Privy layer once the subscriber has signed in; the page never touches it. */
export function setSubscriberWallet(w: SubscriberWallet | null): void {
  wallet = w;
}
/** Set by the Privy layer: how to get a fresh identity token for a binding call (FR-CHK-027). */
export function setIdentityTokenSource(fn: (() => Promise<string | null>) | null): void {
  identityToken = fn;
}
export function hasSubscriberWallet(): boolean {
  return wallet !== null;
}
/** For the account client, which shares the checkout's sign-in (ADR 2026-09-07 account on real data). */
export function getSubscriberWallet(): SubscriberWallet | null {
  return wallet;
}
export function getIdentityToken(): Promise<string | null> {
  return identityToken?.() ?? Promise.resolve(null);
}

export function isSeededSession(id: string): boolean {
  return (SEEDED_SESSION_IDS as readonly string[]).includes(id);
}

export function usesRealApi(id: string): boolean {
  return Boolean(API_URL) && !isSeededSession(id);
}

export function getCheckoutApi(sessionId?: string): CheckoutApi {
  if (sessionId && usesRealApi(sessionId)) {
    if (!real) real = createRealCheckoutApi({ baseUrl: API_URL!, wallet: () => wallet, identityToken: () => identityToken?.() ?? Promise.resolve(null) });
    return real;
  }
  if (!mock) mock = createMockCheckoutApi();
  return mock;
}
