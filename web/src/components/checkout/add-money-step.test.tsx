/**
 * The Add funds step (FR-CHK-031): balance, needed, address, copy, and the
 * return to the cap step once the wallet covers it. The one screen that may
 * name the token and the network; nothing else on it is chain vocabulary.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutBalance } from "@/lib/checkout/types";
import { AddMoneyStep } from "./add-money-step";

const short: CheckoutBalance = { balanceUsd: "3.10", needsFunding: true, receiveAddress: "0x2f1e8c9a4b7d6e5f0a1b2c3d4e5f60718293a4b5", token: "AUSD", network: "Monad testnet" };

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("AddMoneyStep", () => {
  it("FR_CHK_031_shows_balance_needed_the_address_and_one_sentence_naming_token_and_network", async () => {
    render(<AddMoneyStep neededUsd="14.4" initial={short} refresh={async () => short} onFunded={vi.fn()} cancelHref="https://nimbus.example/cancel" />);
    expect(screen.getByRole("heading", { name: /add funds to start/i })).toBeInTheDocument();
    expect(screen.getByText("$3.10")).toBeInTheDocument();
    expect(screen.getByText("$14.40")).toBeInTheDocument();
    expect(screen.getByText(short.receiveAddress)).toBeInTheDocument();
    expect(screen.getByText(/send AUSD on Monad testnet to this address/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /address as a qr code/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /not now/i })).toHaveAttribute("href", "https://nimbus.example/cancel");
    // No other chain vocabulary.
    expect(document.body.textContent).not.toMatch(/wallet|gas|seed|transaction|contract|explorer|fee/i);
  });

  it("FR_CHK_031_copy_puts_the_address_on_the_clipboard_and_says_so", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    render(<AddMoneyStep neededUsd="14.4" initial={short} refresh={async () => short} onFunded={vi.fn()} cancelHref="#" />);
    await user.click(screen.getByRole("button", { name: /copy address/i }));
    expect(write).toHaveBeenCalledWith(short.receiveAddress);
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("FR_CHK_031_polls_every_five_seconds_and_hands_back_once_the_balance_covers_the_cap", async () => {
    let balance = "3.10";
    const refresh = vi.fn(async () => ({ ...short, balanceUsd: balance }));
    const onFunded = vi.fn();
    render(<AddMoneyStep neededUsd="14.4" initial={short} refresh={refresh} onFunded={onFunded} cancelHref="#" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onFunded).not.toHaveBeenCalled();
    balance = "20.00";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_100);
    });
    await waitFor(() => expect(screen.getByText("$20.00")).toBeInTheDocument());
    expect(onFunded).toHaveBeenCalledWith(expect.objectContaining({ balanceUsd: "20.00" }));
  });
});
