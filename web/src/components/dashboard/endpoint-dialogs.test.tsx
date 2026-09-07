import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EndpointFormDialog } from "./endpoint-dialogs";

describe("EndpointFormDialog", () => {
  it("FR_DSH_114_save_waits_for_an_http_url_and_at_least_one_event", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EndpointFormDialog open title="Add endpoint" submitLabel="Add endpoint" error={null} busy={false} onCancel={() => {}} onSubmit={onSubmit} />);
    const save = screen.getByRole("button", { name: "Add endpoint" });
    const url = screen.getByLabelText("Endpoint URL");
    expect(url).toHaveAttribute("maxlength", "2048");
    expect(save).toBeDisabled();
    await user.type(url, "your.app/hooks");
    expect(screen.getByText("Enter a link starting with https://.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.clear(url);
    await user.type(url, "https://your.app/hooks ");
    expect(save).toBeEnabled();
    await user.click(screen.getByLabelText("All events"));
    expect(screen.getByText("Pick at least one event.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.click(screen.getByLabelText("subscription.canceled"));
    expect(save).toBeEnabled();
    await user.click(save);
    expect(onSubmit).toHaveBeenCalledWith({ url: "https://your.app/hooks", events: ["subscription.canceled"] });
  });

  it("FR_DSH_115_a_server_rejection_shows_under_the_url", () => {
    render(<EndpointFormDialog open title="Add endpoint" submitLabel="Add endpoint" error="Live endpoints need https://." busy={false} onCancel={() => {}} onSubmit={() => {}} />);
    expect(screen.getByLabelText("Endpoint URL")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Live endpoints need https://.");
  });
});
