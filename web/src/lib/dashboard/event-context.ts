import { shortId } from "./format";
import type { Event } from "./types";

/**
 * The one-line context under an event row (dashboard FR-DSH-093): product name,
 * then the customer's email (or their short `cus_` id when they have none), then `$amount` on invoice events unless `amount: false`
 * (the home feed drops it). Returns null when the API resolved nothing, so the
 * row renders id-only as before.
 */
export function eventContextLine(e: Pick<Event, "context">, { amount = true }: { amount?: boolean } = {}): string | null {
  const c = e.context;
  if (!c) return null;
  const parts = [c.productName, c.customerEmail ?? shortId(c.customer)];
  if (amount && c.amountSettled) parts.push(`$${c.amountSettled}`);
  return parts.join(" · ");
}
