/**
 * `MerchantReadout` — the same session from the merchant's side, set as a
 * three-cell ledger under the meter: what the subscriber paid, what the
 * merchant receives, what Elapse keeps. Every figure comes from the meter's
 * settled nano-dollars and the fee in the deployment record; nothing is
 * typed in. All three share one precision, chosen from the fee so the small
 * number is still a real number and the three figures visibly add up: four
 * places under a tenth of a cent, three under a cent, else two. Floored,
 * never rounded up.
 *
 * At rest it shows the canonical 83-second example, labelled as such.
 *
 * Maps to: FR-LND-015, FR-LND-018.
 */
import { FEE_BPS, splitSettled } from "@/lib/fee";
import { formatUsd } from "@/lib/meter/math";

const ONE_CENT_NANO = 10_000_000n;
const TENTH_CENT_NANO = 1_000_000n;

export function MerchantReadout({
  paidNano,
  seconds,
  example = false,
  feeBps = FEE_BPS,
  className,
}: {
  paidNano: bigint;
  seconds: number;
  /** True while the figures are the canonical example rather than the visitor's session. */
  example?: boolean;
  feeBps?: number;
  className?: string;
}) {
  const { merchant, fee } = splitSettled(paidNano, feeBps);
  const decimals = fee < TENTH_CENT_NANO ? 4 : fee < ONE_CENT_NANO ? 3 : 2;
  const cells = [
    ["Subscriber paid", formatUsd(paidNano, decimals)],
    ["Merchant receives", formatUsd(merchant, decimals)],
    ["Elapse keeps", formatUsd(fee, decimals)],
  ] as const;
  return (
    <dl
      aria-label={`${example ? "Example: " : ""}${seconds} seconds. ${cells.map(([k, v]) => `${k} ${v}`).join(", ")}`}
      className={className}
    >
      <div className="divide-y divide-border sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {cells.map(([label, value]) => (
          <div
            key={label}
            className="flex min-w-0 items-baseline justify-between gap-3 py-2.5 sm:flex-col sm:gap-1.5 sm:px-4 sm:py-3 sm:first:pl-0 sm:last:pr-0"
          >
            <dt className="placard whitespace-nowrap">{label}</dt>
            <dd className="numerals truncate text-[15px] md:text-base">{value}</dd>
          </div>
        ))}
      </div>
      {example && (
        <p className="numerals mt-2 text-[11px] text-ink-soft">
          example · {seconds} s at $0.004/s · fee {feeBps / 100} %
        </p>
      )}
    </dl>
  );
}
