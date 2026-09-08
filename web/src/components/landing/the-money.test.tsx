import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import record from "@/lib/deployments/10143.json";
import { TheMoney } from "./the-money";

describe("FR-LND-017 the money", () => {
  it("FR_LND_017_states_payout_fee_refund_and_no_chargebacks_with_the_fee_from_the_record", () => {
    const { container } = render(<TheMoney />);
    expect(screen.getAllByText(new RegExp(`${record.feeBps / 100} %`)).length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).not.toMatch(/1 %/);
    expect(screen.getByText(/as it accrues/i)).toBeInTheDocument();
    expect(screen.getByText(/no chargebacks/i)).toBeInTheDocument();
    expect(screen.getByText(/unused funds/i)).toBeInTheDocument();
  });

  it("FR_LND_017_says_the_chain_once_in_one_sentence", () => {
    const { container } = render(<TheMoney />);
    const text = container.textContent ?? "";
    expect(text.match(/Monad/g)).toHaveLength(1);
    expect(text).toMatch(/AUSD/);
    expect(text).toMatch(/400 ms/);
  });
});
