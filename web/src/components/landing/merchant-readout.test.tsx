import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MerchantReadout } from "./merchant-readout";
import { parseRate, settledNano } from "@/lib/meter/math";

describe("FR-LND-015 merchant readout", () => {
  const paid = settledNano(parseRate("0.004"), 83);

  it("FR_LND_015_at_rest_it_shows_the_83_second_example_labelled_example", () => {
    render(<MerchantReadout paidNano={paid} seconds={83} example feeBps={200} />);
    expect(screen.getByText(/example/i)).toBeInTheDocument();
    expect(screen.getByText("$0.332")).toBeInTheDocument();
    expect(screen.getByText("$0.325")).toBeInTheDocument();
    expect(screen.getByText("$0.006")).toBeInTheDocument(); // 0.00664 floored, never rounded up
  });

  it("FR_LND_015_a_live_session_shows_the_visitors_numbers_without_the_example_label", () => {
    const live = settledNano(parseRate("0.004"), 30);
    render(<MerchantReadout paidNano={live} seconds={30} feeBps={200} />);
    expect(screen.queryByText(/example/i)).toBeNull();
    expect(screen.getByText("$0.120")).toBeInTheDocument();
    expect(screen.getByText("$0.117")).toBeInTheDocument();
    expect(screen.getByText("$0.002")).toBeInTheDocument();
  });

  it("FR_LND_015_the_first_seconds_show_four_places_so_no_figure_reads_as_nothing", () => {
    const early = settledNano(parseRate("0.004"), 2);
    render(<MerchantReadout paidNano={early} seconds={2} feeBps={200} />);
    expect(screen.getByText("$0.0080")).toBeInTheDocument();
    expect(screen.getByText("$0.0078")).toBeInTheDocument();
    expect(screen.getByText("$0.0001")).toBeInTheDocument();
  });

  it("FR_LND_015_labels_carry_the_words_so_colour_is_never_the_only_signal", () => {
    render(<MerchantReadout paidNano={paid} seconds={83} feeBps={200} />);
    expect(screen.getByText(/subscriber paid/i)).toBeInTheDocument();
    expect(screen.getByText(/merchant receives/i)).toBeInTheDocument();
    expect(screen.getByText(/elapse keeps/i)).toBeInTheDocument();
  });
});
