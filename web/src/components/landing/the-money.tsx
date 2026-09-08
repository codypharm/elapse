/**
 * `TheMoney` — the business in four statements, one fact each, for the
 * founder and the finance owner: payout as it accrues, the fee, the refund,
 * no chargebacks. The figure column is numbers only, so the proof amber
 * marks a quantity and never a word. The fee is rendered from the
 * deployment record, never typed. Then one sentence about the chain, the only chain words on the
 * page above the footer, below the fold (BR-LND-001).
 *
 * Maps to: FR-LND-017, FR-LND-018.
 */
import { feePercent } from "@/lib/fee";

export function TheMoney() {
  const fee = feePercent();
  const rows = [
    {
      figure: "1 h",
      title: "Paid out as it accrues",
      body: "Settled to your payout address every hour a meter runs, and at once when it stops. No balance to withdraw, no payout day.",
    },
    {
      figure: fee,
      title: "Of settled seconds",
      body: `Elapse keeps ${fee} of what a meter earned, taken inside each settlement. Refunds carry no fee. There is no monthly platform charge.`,
    },
    {
      figure: "$0",
      title: "Left on the table",
      body: "Unused funds go back to the subscriber the moment they stop. Nobody emails support for a refund, and nobody is paying for a month they left.",
    },
    {
      figure: "0",
      title: "No chargebacks",
      body: "Every meter is prefunded before it starts, so a subscriber can only spend what they put in, and a bank can never pull it back out.",
    },
  ] as const;
  return (
    <section className="border-b border-border bg-card/60">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-16 md:px-8 md:py-20">
        <div className="flex flex-col gap-5">
          <h2 className="display-wide text-balance text-3xl font-semibold leading-tight tracking-[-0.03em] md:text-[2.5rem]">
            The money.
          </h2>
          <p className="max-w-[44ch] text-pretty text-lg text-ink-soft">
            Dollars in, dollars out, and every number on this page comes from
            the same math that settles the meter.
          </p>
          <p className="max-w-[44ch] text-pretty text-ink-soft">
            Elapse settles in AUSD on Monad, a dollar stablecoin on a chain
            with a block every 400 ms, which is what makes a second an honest
            unit of billing rather than a rounding of a month.
          </p>
        </div>
        <dl className="divide-y divide-border border-y border-border">
          {rows.map(({ figure, title, body }) => (
            <div
              key={title}
              className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-2 py-6 md:grid-cols-[7rem_minmax(0,1fr)]"
            >
              <dt className="numerals text-2xl leading-none text-live md:pt-0.5">{figure}</dt>
              <div className="flex min-w-0 flex-col gap-1.5">
                <dd className="text-lg font-semibold leading-tight tracking-[-0.01em]">{title}</dd>
                <dd className="max-w-[56ch] text-pretty text-ink-soft">{body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
