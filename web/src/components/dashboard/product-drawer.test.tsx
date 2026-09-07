import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProductDrawer } from "./product-drawer";
import type { Product } from "@/lib/dashboard/types";

const product: Product = { id: "prod_1", livemode: false, name: "GPU", description: null, rateUsdPerSecond: "0.004", allowPause: false, status: "active", activeSubscriptions: 0, createdAt: 0 };

describe("ProductDrawer", () => {
  it("FR_DSH_114_create_blocks_submit_until_name_and_rate_pass_the_shared_rules", async () => {
    const onSubmit = vi.fn();
    render(<ProductDrawer open initial={undefined} error={null} busy={false} onCancel={() => {}} onSubmit={onSubmit} />);
    const save = screen.getByRole("button", { name: "Create product" });
    expect(save).toBeDisabled();
    const name = screen.getByLabelText("Name");
    const rate = screen.getByLabelText("Rate per second (USD)");
    expect(name).toHaveAttribute("maxlength", "200");
    expect(screen.getByLabelText(/Description/)).toHaveAttribute("maxlength", "1000");
    await userEvent.type(name, "  GPU  ");
    // FR-DSH-114: the rate field refuses keystrokes that could never form a rate (letters, a second
    // dot, a seventh decimal) instead of accepting them and complaining afterwards.
    await userEvent.type(rate, "abc");
    expect(rate).toHaveValue("");
    expect(screen.queryByText("Enter a decimal like 0.004.")).toBeNull();
    expect(save).toBeDisabled();
    await userEvent.type(rate, "0.0000001");
    expect(rate).toHaveValue("0.000000");
    await userEvent.clear(rate);
    await userEvent.type(rate, "0..0-04x");
    expect(rate).toHaveValue("0.004");
    await userEvent.clear(rate);
    await userEvent.type(rate, "0.004");
    expect(screen.getByText(/\/ min ·/)).toBeInTheDocument();
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSubmit).toHaveBeenCalledWith({ name: "GPU", rateUsdPerSecond: "0.004", description: null, allowPause: false });
  });

  it("FR_DSH_116_edit_shows_the_rate_read_only_and_points_at_a_new_product", () => {
    render(<ProductDrawer open initial={product} error={null} busy={false} onCancel={() => {}} onSubmit={() => {}} />);
    expect(screen.queryByLabelText("Rate per second (USD)")).toBeNull();
    expect(screen.getByText("$0.004 / second")).toBeInTheDocument();
    expect(screen.getByText("To change the rate, create a new product.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("FR_DSH_115_a_server_rejection_lands_under_the_field_it_names", () => {
    render(<ProductDrawer open initial={undefined} error={{ field: "name", message: "Keep it under 200 characters." }} busy={false} onCancel={() => {}} onSubmit={() => {}} />);
    const name = screen.getByLabelText("Name");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Keep it under 200 characters.");
  });
});
