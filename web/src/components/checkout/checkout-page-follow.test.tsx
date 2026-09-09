/**
 * FR-CHK-032: the meter follows the server. While the subscription runs the
 * page re-reads the session every 5 s and on focus; a cancel that happened
 * elsewhere (merchant cancel, cap end on chain) moves it to the receipt with
 * the server's totals, and the polling stops there.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCheckoutApi, type CheckoutApi } from "@/lib/checkout/mock-api";
import type { CheckoutSession } from "@/lib/checkout/types";

const now = 1_757_160_000_000;
const inner = createMockCheckoutApi({ latencyMs: 0, now: () => now });
let serverStopped = false;
const reads = vi.fn();
const api: CheckoutApi = {
  ...inner,
  async getSession(id) {
    reads(id);
    const s = await inner.getSession(id);
    if (!serverStopped || !s.subscription) return s;
    const stopped: CheckoutSession = {
      ...s,
      status: "complete",
      subscription: { ...s.subscription, status: "canceled", canceledAt: now, endedReason: "canceled", settled: { secondsElapsed: 74, settledUsd: "0.296" } },
    };
    return stopped;
  },
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/checkout/client", () => ({
  getCheckoutApi: () => api,
  usesRealApi: () => false,
}));

import { CheckoutPage } from "./checkout-page";

beforeEach(() => {
  serverStopped = false;
  reads.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe("CheckoutPage · FR-CHK-032 the meter follows the server", () => {
  it("FR_CHK_032_a_cancel_from_elsewhere_reaches_the_page_within_5s_with_the_servers_totals_and_polling_stops", async () => {
    render(<CheckoutPage sessionId="cs_running" />);
    expect(await screen.findByRole("button", { name: /^stop$/i })).toBeInTheDocument();
    const afterLoad = reads.mock.calls.length;

    serverStopped = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_200);
    });
    await waitFor(() => expect(screen.getByText(/you paid for/i)).toBeInTheDocument());
    expect(screen.getByText(/74 seconds/)).toBeInTheDocument();
    expect(screen.getAllByText("$0.296").length).toBeGreaterThanOrEqual(1);
    expect(reads.mock.calls.length).toBeGreaterThan(afterLoad);

    const atReceipt = reads.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(reads.mock.calls.length).toBe(atReceipt);
  });

  it("FR_CHK_032_regaining_focus_reads_the_session_without_waiting_for_the_interval", async () => {
    render(<CheckoutPage sessionId="cs_running" />);
    await screen.findByRole("button", { name: /^stop$/i });
    // Let any read started by the load settle, then count from a quiet state.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    const before = reads.mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    // Well inside the 5 s interval: the read came from focus.
    await waitFor(() => expect(reads.mock.calls.length).toBeGreaterThan(before), { timeout: 1_000 });
  });
});
