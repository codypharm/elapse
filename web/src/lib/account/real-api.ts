/**
 * The subscriber account against the platform API (FR-CHK-016–020, API FR-API-121/123; ADR
 * 2026-09-07 account on real data). Same `AccountApi` shape as the mock, so the page does not
 * know which it holds. Every call carries the Privy identity token; no token, or a refused
 * one, reads as signed out. Rows come back for both modes; a test-mode meter is tagged.
 * Cancel mirrors the checkout: prepare, sign the 32 bytes with the embedded wallet, submit,
 * then poll the list until ingest confirms `canceled`.
 */
import { AccountApiError, type AccountApi } from "./mock-api";
import type { AccountMerchant, AccountMeter, AccountReceipt, AccountView } from "./types";
import type { SubscriberWallet } from "@/lib/checkout/real-api";

export interface WireAccountSubscription {
  id: `sub_${string}`;
  status: "active" | "paused" | "canceled";
  livemode: boolean;
  checkout_session?: string | null;
  restarted_as?: string | null;
  merchant: { name: string; logo_url: string | null; support_url: string | null };
  product: { name: string; rate_usd_per_second: string };
  started_at: number | null;
  paused_at: number | null;
  canceled_at: number | null;
  ended_reason: "canceled" | "cap_reached" | null;
  max_duration_seconds: number;
  funded_usd: string;
  settled_usd: string;
  refunded_usd: string;
  seconds_elapsed: number;
}

export interface RealAccountOptions {
  baseUrl: string;
  wallet: () => SubscriberWallet | null;
  identityToken: () => Promise<string | null>;
  sleep?: (ms: number) => Promise<void>;
  confirmTimeoutMs?: number;
}

const merchantOf = (w: WireAccountSubscription["merchant"]): AccountMerchant => ({
  name: w.name,
  ...(w.logo_url ? { logoUrl: w.logo_url } : {}),
  ...(w.support_url ? { supportUrl: w.support_url } : {}),
});
const ms = (s: number | null) => (s === null ? null : s * 1000);

export function meterFrom(w: WireAccountSubscription): AccountMeter {
  return {
    subscription: w.id,
    test: !w.livemode,
    merchant: merchantOf(w.merchant),
    product: { name: w.product.name, rateUsdPerSecond: w.product.rate_usd_per_second },
    status: w.status === "paused" ? "paused" : "active",
    startedAt: ms(w.started_at) ?? 0,
    pausedAt: ms(w.paused_at),
    maxDurationSeconds: w.max_duration_seconds,
    fundedUsd: w.funded_usd,
  };
}

export function receiptFrom(w: WireAccountSubscription): AccountReceipt {
  return {
    subscription: w.id,
    ...(w.checkout_session ? { session: w.checkout_session as `cs_${string}` } : {}),
    ...(w.restarted_as ? { restartedAs: w.restarted_as as `cs_${string}` } : {}),
    test: !w.livemode,
    merchant: merchantOf(w.merchant),
    product: { name: w.product.name, rateUsdPerSecond: w.product.rate_usd_per_second },
    seconds: w.seconds_elapsed,
    amountSettledUsd: w.settled_usd,
    refundedUsd: w.refunded_usd,
    startedAt: ms(w.started_at) ?? 0,
    settledAt: ms(w.canceled_at) ?? ms(w.started_at) ?? 0,
    endedReason: w.ended_reason ?? "canceled",
    maxDurationSeconds: w.max_duration_seconds,
  };
}

export function viewFrom(rows: WireAccountSubscription[]): AccountView {
  const running = rows.filter((r) => r.status === "active" || r.status === "paused");
  const ended = rows.filter((r) => r.status === "canceled");
  return {
    status: "signed_in",
    meters: running.map(meterFrom).sort((a, b) => b.startedAt - a.startedAt),
    receipts: ended.map(receiptFrom).sort((a, b) => b.settledAt - a.settledAt),
  };
}

class SignedOut extends AccountApiError {
  constructor() {
    super("invalid_state", "Sign in to see your meters.");
  }
}

export function createRealAccountApi(o: RealAccountOptions): AccountApi {
  const sleep = o.sleep ?? ((t) => new Promise((r) => setTimeout(r, t)));
  const timeout = o.confirmTimeoutMs ?? 90_000;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const token = await o.identityToken();
    if (!token) throw new SignedOut();
    let res: Response;
    try {
      res = await fetch(`${o.baseUrl}${path}`, {
        method,
        headers: { "X-Privy-Token": token, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new AccountApiError("network", "We couldn't reach Elapse. Check your connection and try again.");
    }
    const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    if (!res.ok) {
      const code = json?.error?.code;
      if (res.status === 401) throw new SignedOut();
      if (res.status === 404) throw new AccountApiError("not_found", "That meter is not yours or no longer exists.");
      if (res.status === 429 && code === "receipt_already_sent") throw new AccountApiError("already_sent", "Already sent. Check your inbox.");
      throw new AccountApiError(res.status >= 500 ? "network" : "invalid_state", json?.error?.message ?? "Something went wrong.");
    }
    return json as T;
  }

  const list = async () => (await call<{ data: WireAccountSubscription[] }>("GET", "/v1/account/subscriptions")).data;

  async function view(): Promise<AccountView> {
    try {
      return viewFrom(await list());
    } catch (e) {
      if (e instanceof SignedOut) return { status: "signed_out" };
      throw e;
    }
  }

  return {
    getView: view,
    // Privy has already run by the time the page calls this; reading the list is the sign-in.
    signIn: view,

    async cancel(subscription) {
      const w = o.wallet();
      if (!w) throw new SignedOut();
      const auth = await call<{ message: `0x${string}`; deadline: string }>("POST", `/v1/account/subscriptions/${subscription}/cancel/prepare`, {});
      const signature = await w.signMessage(auth.message);
      await call("POST", `/v1/account/subscriptions/${subscription}/cancel`, { signature, deadline: auth.deadline });
      const deadline = Date.now() + timeout;
      let rows = await list();
      let done = rows.find((r) => r.id === subscription && r.status === "canceled");
      while (!done && Date.now() < deadline) {
        await sleep(1500);
        rows = await list();
        done = rows.find((r) => r.id === subscription && r.status === "canceled");
      }
      if (!done) throw new AccountApiError("network", "The network is taking longer than usual. Your meter will update shortly.");
      return { receipt: receiptFrom(done), view: viewFrom(rows) };
    },

    async emailReceipt(subscription) {
      return call<{ sent: true }>("POST", `/v1/account/subscriptions/${subscription}/receipt/email`, {});
    },

    // FR-API-126 through the checkout route: the identity token is the only pass it needs.
    async startAgain(session) {
      const next = await call<{ id: string; url: string }>("POST", `/v1/checkout/sessions/${session}/again`, {});
      return { url: next.url };
    },
  };
}
