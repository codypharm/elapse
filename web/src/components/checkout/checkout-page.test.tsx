/**
 * The checkout page on the seeded `cs_short` session (FR-CHK-031): the cap step
 * shows the balance, Add funds opens the step, the wallet fills up, and the
 * page returns to the cap step with Continue available.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockCheckoutApi } from "@/lib/checkout/mock-api";

let now = 1_757_160_000_000;
const api = createMockCheckoutApi({ latencyMs: 0, now: () => now });

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
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe("CheckoutPage · short wallet", () => {
  it("FR_CHK_031_a_short_wallet_sees_its_balance_adds_money_and_returns_to_the_cap_step_once_funded", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CheckoutPage sessionId="cs_short" />);
    expect(await screen.findByText(/you have \$0\.50 available/i)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /add funds/i }));
    expect(await screen.findByRole("heading", { name: /add funds to start/i })).toBeInTheDocument();
    expect(screen.getByText(/send AUSD on Monad testnet/i)).toBeInTheDocument();

    // Money lands; the next poll notices and hands back to the cap step.
    now += 6_500;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_200);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /^continue$/i })).toBeInTheDocument());
    expect(screen.getByText(/you have \$20\.00 available/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /add funds to start/i })).toBeNull();
  });
});
