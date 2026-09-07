/**
 * The account API the browser uses (ADR 2026-09-07 account on real data): the platform API
 * whenever `NEXT_PUBLIC_ELAPSE_API_URL` is set, sharing the checkout's wallet and identity
 * token; otherwise an empty in-memory mock so a build without an API never shows invented
 * meters. Seeds exist only for component tests, behind `createMockAccountApi`.
 */
"use client";

import { createMockAccountApi, type AccountApi } from "./mock-api";
import { createRealAccountApi } from "./real-api";
import { getSubscriberWallet, getIdentityToken } from "@/lib/checkout/client";

const API_URL = process.env.NEXT_PUBLIC_ELAPSE_API_URL;
let instance: AccountApi | null = null;

export const usesRealAccountApi = () => Boolean(API_URL);

export function getAccountApi(): AccountApi {
  if (!instance) {
    instance = API_URL
      ? createRealAccountApi({ baseUrl: API_URL, wallet: getSubscriberWallet, identityToken: getIdentityToken })
      : createMockAccountApi({ seed: "empty" });
  }
  return instance;
}
