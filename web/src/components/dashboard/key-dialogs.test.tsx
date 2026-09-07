import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CreateKeyDialog, RevokeKeyDialog } from "./key-dialogs";
import type { ApiKey } from "@/lib/dashboard/types";

const key = (mode: "test" | "live"): ApiKey => ({ id: "key_1", livemode: mode === "live", name: "Production server", prefix: mode === "live" ? "sk_live_" : "sk_test_", last4: "ab12", status: "active", createdAt: 0, lastUsedAt: null, revokedAt: null, expiresAt: null });

describe("key dialogs", () => {
  it("FR_DSH_114_create_caps_the_name_at_100_and_sends_it_trimmed", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<CreateKeyDialog open onCancel={() => {}} onCreate={onCreate} busy={false} />);
    const name = screen.getByLabelText("Name");
    expect(name).toHaveAttribute("maxlength", "100");
    expect(screen.getByRole("button", { name: "Create key" })).toBeDisabled();
    await user.type(name, "  Staging  ");
    await user.click(screen.getByRole("button", { name: "Create key" }));
    expect(onCreate).toHaveBeenCalledWith("Staging");
  });

  it("FR_DSH_117_revoking_a_live_key_needs_its_name_typed_a_test_key_does_not", async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    const { rerender } = render(<RevokeKeyDialog target={key("live")} onCancel={() => {}} onRevoke={onRevoke} busy={false} />);
    const revoke = screen.getByRole("button", { name: "Revoke key" });
    expect(revoke).toBeDisabled();
    const confirm = screen.getByLabelText(/type the key's name to confirm/i);
    await user.type(confirm, "Production");
    expect(revoke).toBeDisabled();
    await user.type(confirm, " server");
    expect(revoke).toBeEnabled();
    await user.click(revoke);
    expect(onRevoke).toHaveBeenCalledTimes(1);
    rerender(<RevokeKeyDialog target={key("test")} onCancel={() => {}} onRevoke={onRevoke} busy={false} />);
    expect(screen.queryByLabelText(/type the key's name to confirm/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Revoke key" })).toBeEnabled();
  });
});
