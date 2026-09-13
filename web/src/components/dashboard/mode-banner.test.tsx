/**
 * The mode banner under the top bar.
 *
 * FR-DSH-003 (amber test banner), FR-DSH-143 (live-mode mainnet banner while
 * the platform's live chain is not 143; ADR 2026-09-13 AUSD only).
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ModeBanner } from "./mode-banner";
import { MerchantProvider } from "./merchant-context";
import type { DashboardApi } from "@/lib/dashboard/mock-api";
import type { Merchant } from "@/lib/dashboard/types";
import { MODE_STORAGE_KEY } from "@/lib/dashboard/mode";

const merchant = (liveChainId: number): Merchant => ({
  id: "mrc_demo",
  email: "demo@elapse.finance",
  name: "Nimbus",
  supportEmail: null,
  supportUrl: null,
  payoutAddress: null,
  feeBps: 200,
  liveChainId,
  branding: { name: "Nimbus" },
  createdAt: 0,
});

function renderBanner(mode: "test" | "live", liveChainId: number) {
  localStorage.setItem(MODE_STORAGE_KEY, mode);
  return render(
    <MerchantProvider value={{ merchant: merchant(liveChainId), api: {} as DashboardApi, setMerchant: () => {} }}>
      <ModeBanner />
    </MerchantProvider>,
  );
}

beforeEach(() => localStorage.clear());

describe("FR-DSH-143 live-mode mainnet banner", () => {
  it("FR_DSH_143_live_mode_on_testnet_shows_the_AUSD_banner", () => {
    renderBanner("live", 10143);
    const banner = screen.getByRole("status", { name: "Live mode" });
    expect(banner.textContent).toContain("Live mode settles real AUSD.");
    expect(banner.textContent).toContain("Until mainnet launch it runs on Monad testnet; at launch it moves to mainnet AUSD with no integration change.");
    expect(screen.queryByRole("status", { name: "Test mode" })).toBeNull();
  });

  it("FR_DSH_143_the_banner_is_gone_once_the_live_chain_is_mainnet", () => {
    renderBanner("live", 143);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("FR_DSH_003_test_mode_keeps_the_test_banner_and_never_both", () => {
    renderBanner("test", 10143);
    const banner = screen.getByRole("status", { name: "Test mode" });
    expect(banner.textContent).toContain("Test mode.");
    expect(screen.queryByRole("status", { name: "Live mode" })).toBeNull();
  });
});
