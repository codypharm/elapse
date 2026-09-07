/**
 * `PayoutBanner` — one persistent line under the top bar while the merchant has
 * no payout address: without it no checkout link can be created and live keys
 * are not issued (API FR-API-035/036). Gone the moment the address is saved.
 *
 * Maps to: FR-DSH-015; ADR 2026-09-07 payout address gates checkout and live keys.
 */
"use client";

import Link from "next/link";
import type { Merchant } from "@/lib/dashboard/types";

export function PayoutBanner({ merchant }: { merchant: Pick<Merchant, "payoutAddress"> }) {
  if (merchant.payoutAddress) return null;
  return (
    <div
      role="status"
      aria-label="Payout address missing"
      className="border-b border-border bg-muted px-5 py-1.5 text-[13px] text-foreground md:px-8"
    >
      <span className="font-semibold">Set a payout address to create checkout links and go live.</span>{" "}
      <Link href="/dashboard/settings" className="underline underline-offset-4 hover:text-primary">
        Open Settings
      </Link>
    </div>
  );
}
