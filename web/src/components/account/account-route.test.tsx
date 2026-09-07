import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountRoute } from "./account-route";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("as=two-merchants") }));

describe("AccountRoute", () => {
  it("FR_CHK_025_the_route_ignores_seed_flags_and_never_shows_invented_meters", async () => {
    render(<AccountRoute />);
    // Without an API the page runs on the empty mock: no meters, no Nimbus, no Halcyon.
    expect(await screen.findByText(/no meters yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Nimbus")).toBeNull();
    expect(screen.queryByText(/halcyon/i)).toBeNull();
  });
});
