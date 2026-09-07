import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckoutFrame } from "./checkout-frame";

// The merchant's branding is server-validated, but the frame is the last line: a colour becomes
// a CSS value and a URL becomes an href, so both are checked again here (FR-DSH-114, FR-CHK-014).
describe("CheckoutFrame branding", () => {
  it("FR_CHK_014_a_well_formed_accent_and_https_support_link_are_applied_with_noreferrer", () => {
    const { container } = render(
      <CheckoutFrame merchant={{ name: "Nimbus", accent: "#3b82f6", supportUrl: "https://nimbus.example/help" }}>
        <p>body</p>
      </CheckoutFrame>,
    );
    expect((container.firstChild as HTMLElement).style.getPropertyValue("--live")).toBe("#3b82f6");
    const link = screen.getByRole("link", { name: "Support" });
    expect(link).toHaveAttribute("href", "https://nimbus.example/help");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("FR_CHK_014_a_malformed_accent_or_non_http_support_url_is_dropped", () => {
    const { container } = render(
      <CheckoutFrame merchant={{ name: "Nimbus", accent: "red; background: url(x)", supportUrl: "javascript:alert(1)" }}>
        <p>body</p>
      </CheckoutFrame>,
    );
    expect((container.firstChild as HTMLElement).style.getPropertyValue("--live")).toBe("");
    expect(screen.queryByRole("link", { name: "Support" })).toBeNull();
  });
});
