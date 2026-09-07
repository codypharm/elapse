/**
 * `AddMoneyStep` — the wallet is short of the chosen cap, so the subscriber
 * sends money to it. Shows the balance (ticking up as money lands), the amount
 * needed, the receiving address as a QR code and text with Copy, and the one
 * sentence naming what to send and where. Polls the balance every 5 s and hands
 * back to the cap step by itself once the cap is affordable.
 *
 * This is the one subscriber screen besides judge mode that names the token
 * and the network (BR-CHK-001 exception). It never shows a token contract, an
 * explorer link, a fee, a seed or a key.
 *
 * Maps to: FR-CHK-031; BR-CHK-001 (exception), BR-CHK-007.
 */
"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { parseUsd } from "@/lib/checkout/funding";
import type { CheckoutBalance } from "@/lib/checkout/types";
import { formatUsd } from "@/lib/meter/math";

/** How often the balance is re-read while this step is open (FR-CHK-031). */
export const BALANCE_POLL_MS = 5_000;

export function AddMoneyStep({
  neededUsd,
  initial,
  refresh,
  onFunded,
  cancelHref,
}: {
  /** The cap's escrow, USD decimal string. */
  neededUsd: string;
  initial: CheckoutBalance;
  /** Re-reads the balance; called on the poll. */
  refresh: () => Promise<CheckoutBalance>;
  /** Called once with the balance that covers the cap. */
  onFunded: (balance: CheckoutBalance) => void;
  /** The merchant's cancel URL, for "Not now". */
  cancelHref: string;
}) {
  const [balance, setBalance] = useState(initial);
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const funded = useRef(false);
  const needed = parseUsd(neededUsd);

  // The QR library is loaded only here; nothing else on the checkout draws one.
  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((q) => q.toString(initial.receiveAddress, { type: "svg", margin: 0, errorCorrectionLevel: "M" }))
      .then((s) => alive && setSvg(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [initial.receiveAddress]);

  useEffect(() => {
    const id = setInterval(() => {
      refresh()
        .then((b) => {
          setBalance(b);
          if (!funded.current && parseUsd(b.balanceUsd) >= needed) {
            funded.current = true;
            onFunded(b);
          }
        })
        .catch(() => {});
    }, BALANCE_POLL_MS);
    return () => clearInterval(id);
  }, [refresh, onFunded, needed]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(balance.receiveAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // The address is on screen; the subscriber can select it.
    }
  };

  return (
    <section className="flex flex-1 flex-col gap-4">
      <div>
        <h2 className="text-balance text-xl font-semibold leading-tight tracking-[-0.02em]">Add funds to start</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Send {balance.token} on {balance.network} to this address. It usually arrives within a minute.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <dt className="text-ink-soft">Balance</dt>
        <dd className="numerals text-right" aria-live="polite">{formatUsd(parseUsd(balance.balanceUsd))}</dd>
        <dt className="text-ink-soft">Needed</dt>
        <dd className="numerals text-right">{formatUsd(needed)}</dd>
      </dl>

      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4">
        <div
          role="img"
          aria-label="Your receiving address as a QR code"
          className="size-44 rounded-md bg-white p-2 [&_svg]:size-full"
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
        <p className="numerals w-full break-all text-center text-xs text-ink-soft select-all">{balance.receiveAddress}</p>
        <Button variant="outline" onClick={() => void copy()} className="h-11 w-full" aria-label="Copy address">
          {copied ? <Check data-icon="inline-start" className="size-4" /> : <Copy data-icon="inline-start" className="size-4" />}
          {copied ? "Copied" : "Copy address"}
        </Button>
      </div>

      <p className="text-center text-xs text-ink-soft">We&rsquo;ll continue by ourselves once it lands.</p>

      <a href={cancelHref} className="mt-auto flex min-h-11 items-center justify-center text-center text-sm !text-ink-soft !no-underline hover:!text-foreground">
        Not now
      </a>
    </section>
  );
}
