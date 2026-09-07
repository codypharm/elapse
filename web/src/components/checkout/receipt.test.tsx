/**
 * The receipt: what you paid, in the product's own words. A session that
 * used its whole cap gets the same receipt plus the reason it ended and a
 * way to start another.
 *
 * FR-CHK-007 (ends at the cap, Start again), FR-CHK-008 (receipt),
 * FR-CHK-009 (back to the merchant), BR-CHK-001 (no chain words).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Receipt as ReceiptData } from "@/lib/checkout/mock-api";
import type { Product } from "@/lib/checkout/types";
import { Receipt } from "./receipt";

const product: Product = {
  id: "prod_gpu",
  name: "GPU · 4090",
  rateUsdPerSecond: "0.004",
  allowPause: false,
  status: "active",
};
const merchant = { name: "Nimbus" };
const receipt = (over: Partial<ReceiptData> = {}): ReceiptData => ({
  secondsElapsed: 83,
  amountSettledUsd: "0.332",
  refundedUsd: "9.668",
  startedAt: 1_756_800_000_000,
  canceledAt: 1_756_800_083_000,
  rateUsdPerSecond: "0.004",
  endedReason: "canceled",
  ...over,
});

const props = {
  product,
  merchant,
  successHref: "https://nimbus.example/ok?session_id=cs_1",
  onEmail: vi.fn(),
};

describe("Receipt", () => {
  it("leads with the seconds and the amount", () => {
    render(<Receipt {...props} receipt={receipt()} />);
    expect(screen.getByText(/83 seconds/)).toBeInTheDocument();
    // once in the hero line, once in the breakdown
    expect(screen.getAllByText("$0.332")).toHaveLength(2);
  });

  it("says the cap is up and offers Start again when it ended at the cap", async () => {
    const onStartAgain = vi.fn();
    const user = userEvent.setup();
    render(
      <Receipt
        {...props}
        receipt={receipt({ endedReason: "cap_reached", secondsElapsed: 3600, amountSettledUsd: "14.40", refundedUsd: "0.00" })}
        maxDurationSeconds={3600}
        onStartAgain={onStartAgain}
      />,
    );
    expect(screen.getByText(/your 1 hour is up/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /start again/i }));
    expect(onStartAgain).toHaveBeenCalled();
  });

  it("does not say the cap is up when the subscriber stopped it (Start again stays, decided 2026-09-07)", () => {
    render(<Receipt {...props} receipt={receipt()} maxDurationSeconds={3600} onStartAgain={vi.fn()} />);
    expect(screen.queryByText(/is up/i)).toBeNull();
    expect(screen.getByRole("button", { name: /start again/i })).toBeInTheDocument();
  });

  it("links to the account page so the subscriber can find their meters (FR-CHK-017)", () => {
    render(<Receipt {...props} receipt={receipt()} />);
    expect(screen.getByRole("link", { name: /manage your meters/i })).toHaveAttribute(
      "href",
      "/account",
    );
  });

  it("uses no chain words", () => {
    const { container } = render(<Receipt {...props} receipt={receipt({ endedReason: "cap_reached" })} maxDurationSeconds={3600} />);
    expect(container.textContent).not.toMatch(/wallet|token|permit|transaction|chain|0x/i);
  });

  it("FR_CHK_029_after_sending_the_button_reads_sent_to_the_address_and_is_disabled", () => {
    render(<Receipt {...props} receipt={receipt()} emailSentTo="a@b.co" />);
    const btn = screen.getByRole("button", { name: /sent to a@b\.co/i });
    expect(btn).toBeDisabled();
  });

  it("FR_CHK_029_without_an_email_handler_no_email_button_is_offered", () => {
    render(<Receipt {...props} receipt={receipt()} onEmail={undefined} />);
    expect(screen.queryByRole("button", { name: /email receipt|sent to/i })).toBeNull();
  });

  it("FR_CHK_007_start_again_is_offered_after_a_cancel_too_without_the_cap_line", async () => {
    const onStartAgain = vi.fn();
    render(<Receipt {...props} receipt={receipt({ endedReason: "canceled" })} maxDurationSeconds={3600} onStartAgain={onStartAgain} />);
    expect(screen.queryByText(/is up/i)).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: /start again/i }));
    expect(onStartAgain).toHaveBeenCalledTimes(1);
  });

  it("FR_CHK_007_a_restarted_receipt_shows_started_again_as_a_link_and_no_button", () => {
    render(<Receipt {...props} receipt={receipt()} onStartAgain={vi.fn()} restartedAs="cs_new" />);
    expect(screen.queryByRole("button", { name: /start again/i })).toBeNull();
    const link = screen.getByRole("link", { name: /newer session followed/i });
    expect(link).toHaveAttribute("href", "/c/cs_new");
  });
});
