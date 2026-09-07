import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FirstRunForm } from "./first-run-form";
import { DashboardApiError, type DashboardApi } from "@/lib/dashboard/mock-api";

const ADDR = "0x1234567890abcdef1234567890abcdef12345678";

describe("FirstRunForm", () => {
  it("FR_DSH_114_continue_waits_for_a_name_and_a_well_formed_optional_address_and_sends_trimmed_values", async () => {
    const user = userEvent.setup();
    const completeFirstRun = vi.fn(async (input: { name: string; payoutAddress?: string }) => ({ id: "m", name: input.name }) as never);
    const onDone = vi.fn();
    render(<FirstRunForm api={{ completeFirstRun } as unknown as DashboardApi} email="m@acme.test" onDone={onDone} />);
    const cont = screen.getByRole("button", { name: /continue/i });
    expect(cont).toBeDisabled();
    const name = screen.getByLabelText(/business name/i);
    expect(name).toHaveAttribute("maxlength", "80");
    await user.type(name, "  Acme ");
    expect(cont).toBeEnabled();
    const payout = screen.getByLabelText(/payout address/i);
    expect(payout).toHaveAttribute("maxlength", "42");
    await user.type(payout, "0xnope");
    expect(screen.getByText("An address is 0x followed by 40 hex characters.")).toBeInTheDocument();
    expect(cont).toBeDisabled();
    await user.clear(payout);
    await user.type(payout, ADDR);
    expect(cont).toBeEnabled();
    await user.click(cont);
    await waitFor(() => expect(completeFirstRun).toHaveBeenCalledWith({ name: "Acme", payoutAddress: ADDR }));
    expect(onDone).toHaveBeenCalled();
  });

  it("FR_DSH_115_a_server_rejection_lands_under_the_field_it_names", async () => {
    const user = userEvent.setup();
    const err = Object.assign(new DashboardApiError("invalid_input", "Invalid payout_address: must be a 0x-prefixed 20-byte address"), { param: "payout_address", status: 400 });
    const api = { completeFirstRun: vi.fn().mockRejectedValue(err) } as unknown as DashboardApi;
    render(<FirstRunForm api={api} email="m@acme.test" onDone={() => {}} />);
    await user.type(screen.getByLabelText(/business name/i), "Acme");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.getByLabelText(/payout address/i)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("alert")).toHaveTextContent("An address is 0x followed by 40 hex characters.");
  });
});
