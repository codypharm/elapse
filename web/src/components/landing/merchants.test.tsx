import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Merchants } from "./merchants";

describe("FR-LND-016 merchants section", () => {
  it("FR_LND_016_is_the_demo_target_and_names_four_categories_not_customers", () => {
    const { container } = render(<Merchants />);
    expect(container.querySelector("section#merchants")).not.toBeNull();
    const terms = Array.from(container.querySelectorAll("dt")).map((d) => d.textContent);
    expect(terms).toEqual(["GPU and inference clouds", "Metered APIs", "Live streaming and events", "SaaS seats"]);
    expect(container.textContent).not.toMatch(/nimbus|acme|trusted by|customers/i);
  });

  it("FR_LND_016_each_category_carries_who_they_are_what_changes_and_an_illustrative_rate", () => {
    render(<Merchants />);
    expect(screen.getByText(/illustrative/i)).toBeInTheDocument();
    // per-second rates with derived per-hour figures from the meter math
    expect(screen.getAllByText(/\/s$/)).toHaveLength(4);
    expect(screen.getAllByText(/≈ \$[\d,.]+ \/h/)).toHaveLength(4);
    expect(screen.getByText(/≈ \$14\.40 \/h/)).toBeInTheDocument();
  });
});
