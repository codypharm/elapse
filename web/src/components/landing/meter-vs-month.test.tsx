import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MeterVsMonth } from "./meter-vs-month";

beforeAll(() => {
  // Motion's whileInView needs an IntersectionObserver; jsdom has none.
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
});

describe("FR-LND-019 meter versus month, in the merchant's voice", () => {
  it("FR_LND_019_the_heading_is_the_growth_argument_and_the_drawing_stays", () => {
    render(<MeterVsMonth />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(/nobody churns from a meter they can stop/i);
    expect(screen.getByRole("img", { name: /30-day bar/i })).toBeInTheDocument();
    expect(screen.getByText(/27 unused days/i)).toBeInTheDocument();
    expect(screen.getByText(/grows with use/i)).toBeInTheDocument();
  });
});
