/**
 * `ModeBanner` — the slim line under the top bar naming the current mode's
 * reality. Test mode: the amber testnet line. Live mode: the AUSD banner,
 * shown for as long as the platform's live chain is not mainnet (143); it
 * disappears with the mainnet record, no copy change needed. Never both.
 *
 * Maps to: FR-DSH-003, FR-DSH-143 (ADR 2026-09-13 AUSD only); BR-DSH-002,
 * BR-DSH-005 (chain names allowed here — this is the merchant surface).
 */
"use client";

import { useMode } from "@/lib/dashboard/mode";
import { useMerchantOptional } from "./merchant-context";

export function ModeBanner() {
  const mode = useMode();
  const session = useMerchantOptional();
  if (mode === "test") {
    return (
      <div
        role="status"
        aria-label="Test mode"
        className="border-b border-caution/25 bg-caution-soft px-5 py-1.5 text-[13px] text-foreground md:px-8"
      >
        <span className="font-semibold text-caution">Test mode.</span>{" "}
        <span className="text-ink-soft">Data here comes from the Monad testnet and test keys.</span>
      </div>
    );
  }
  // Live mode: nothing while the merchant is unknown (loading frame) or once live is mainnet.
  if (!session || session.merchant.liveChainId === 143) return null;
  return (
    <div
      role="status"
      aria-label="Live mode"
      className="border-b border-border bg-surface px-5 py-1.5 text-[13px] text-foreground md:px-8"
    >
      <span className="font-semibold">Live mode settles real AUSD.</span>{" "}
      <span className="text-ink-soft">Until mainnet launch it runs on Monad testnet; at launch it moves to mainnet AUSD with no integration change.</span>
    </div>
  );
}
